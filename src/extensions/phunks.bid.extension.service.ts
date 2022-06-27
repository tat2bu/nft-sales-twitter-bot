import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { BaseService, TweetRequest, TweetType } from '../base.service';
import { ethers } from 'ethers';
import notLarvaLabsAbi from '../abi/notlarvalabs.json';
import { config } from '../config';

@Injectable()
export class PhunksBidService extends BaseService {
  
  provider = this.getWeb3Provider();

  constructor(
    protected readonly http: HttpService
  ) {
    super(http)
    console.log('creating PhunksBidService')

    // Listen for Bid event
    /*
    this.provider.on({ address: '0xd6c037bE7FA60587e174db7A6710f7635d2971e7', topics: ['0x5e5c444a9060fa9489d7e455b3a6f1c2f9b2ac7119c1cee6dc5fe6160c545908'] }, async (event) => {
      if (event.args.length < 3) return
      const from = event?.args[2];
      const value = ethers.utils.formatEther(event.args.value);
      const imageUrl = `${config.local_bids_image_path}${event.args.phunkIndex}.png`;
      const request:TweetRequest = {
        from,
        tokenId: event.args.phunkIndex,
        ether: parseFloat(value),
        transactionHash: event.transactionHash,
        alternateValue: 0,
        type: TweetType.BID_ENTERED,
        imageUrl
      }
      this.tweet(request);
    });    
    */
    const tokenContract = new ethers.Contract('0xd6c037bE7FA60587e174db7A6710f7635d2971e7', notLarvaLabsAbi, this.provider);
    let filter = tokenContract.filters.PhunkBidEntered();
    tokenContract.queryFilter(filter, 15035666, 15035667).then(async (events) => {
      for (const event of events) {
        if (event.args.length < 3) return
        const from = event?.args[2];
        const value = ethers.utils.formatEther(event.args.value);
        const imageUrl = `${config.local_bids_image_path}${event.args.phunkIndex}.png`;
        const request:TweetRequest = {
          from,
          tokenId: event.args.phunkIndex,
          ether: parseFloat(value),
          transactionHash: event.transactionHash,
          alternateValue: 0,
          type: TweetType.BID_ENTERED,
          imageUrl
        }
        this.tweet(request);
      }
    });
    
  }

}
