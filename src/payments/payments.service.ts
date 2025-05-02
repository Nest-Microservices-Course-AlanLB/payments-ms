import { Inject, Injectable, Logger } from '@nestjs/common';
import { envs, NATS_SERVICE } from 'src/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {

    private readonly logger = new Logger('payment.service');
    private readonly stripe = new Stripe(envs.stripeSecret)

    constructor(
        @Inject(NATS_SERVICE)
        private readonly client: ClientProxy
    ) { }


    async createPaymentSession(paymentSessionDto: PaymentSessionDto) {


        const { currency, items, orderId } = paymentSessionDto;


        const lineItems = items.map(item => {
            return {
                price_data: {
                    currency: currency,
                    product_data: {
                        name: item.name
                    },
                    unit_amount: Math.round(item.price * 100), // 20 dollars
                },
                quantity: item.quantity,
            }
        });

        const session = await this.stripe.checkout.sessions.create({
            // Put order id
            payment_intent_data: {
                metadata: {
                    orderId: orderId
                }
            },

            line_items: lineItems,
            mode: 'payment',
            success_url: envs.stripe_success_url,
            cancel_url: envs.stripe_cancel_url,
        });

        // return session;
        return {
            cancelUrl: session.cancel_url,
            successUrl: session.success_url,
            url: session.url,
        }
    }


    async stripeWebhook(req: Request, res: Response) {

        const signature = req.headers['stripe-signature'];

        let event: Stripe.Event;

        const endpointSecret = envs.stripe_endpoint_secret;

        try {
            event = this.stripe.webhooks.constructEvent(
                req['rawBody'],
                signature,
                endpointSecret
            );
        } catch (err) {
            const errorMessage = `⚠️  Webhook signature verification failed. ${err.message}`;
            return res.status(400).json({ error: errorMessage });
        }

        console.log({ event });

        switch (event.type) {


            case 'charge.succeeded':
                const chargeSucceeded = event.data.object;
                const payload = {
                    stripePaymentId: chargeSucceeded.id,
                    orderId: chargeSucceeded.metadata.orderId,
                    receiptUrl: chargeSucceeded.receipt_url,
                }
                // this.logger.log({ payload });

                this.client.emit('payment.succeeded', payload);
                break;

            default:
                console.log(`Event: ${event.type} not handled`);

        }


        return res.status(200).json({ signature })
    }
}
