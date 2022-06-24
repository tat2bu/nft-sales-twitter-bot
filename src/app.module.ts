import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { Erc721SalesService } from './erc721sales.service';
import { PhunksBidService } from './extensions/phunks.bid.extension.service';

@Module({
  imports: [HttpModule],
  controllers: [],
  providers: [
    Erc721SalesService, 
    // PhunksBidService,
  ],
})

export class AppModule {}
