import { Controller, Get } from '@nestjs/common';

@Controller('/')
export class HealthCheckController {
  constructor() {}


  @Get()
  healthCheck() {
    return 'Payments microservice is up and running.';
  }




}
