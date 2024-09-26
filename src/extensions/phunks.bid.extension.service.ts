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
    const tokenContract = new ethers.Contract('0xd6c037bE7FA60587e174db7A6710f7635d2971e7', notLarvaLabsAbi, this.provider);
    let filter = tokenContract.filters.PhunkBidEntered();
    tokenContract.on(filter, (async (token, amount, from, event) => {
      const imageUrl = `${config.local_bids_image_path}${token}.png`;
      const value = ethers.utils.formatEther(amount)
      // If ens is configured, get ens addresses
      let ensFrom: string;
      if (config.ens) {
        ensFrom = await this.provider.lookupAddress(`${from}`);
      }      
      const request:TweetRequest = {
        from: ensFrom ?? this.shortenAddress(from),
        tokenId: token,
        ether: parseFloat(value),
        transactionHash: event.transactionHash,
        alternateValue: 0,
        type: TweetType.BID_ENTERED,
        imageUrl
      }
      this.tweet(request);
    }))
    /*
    tokenContract.queryFilter(filter, 
      15097563, 
      15097563).then(async (events) => {
      for (const event of events) {
        if (event?.args.length < 3) return
        const from = event?.args[2];
        // If ens is configured, get ens addresses
        let ensFrom: string;
        if (config.ens) {
          ensFrom = await this.provider.lookupAddress(`${from}`);
        }      
        const value = ethers.utils.formatEther(event.args.value);
        const imageUrl = `${config.local_bids_image_path}${event.args.phunkIndex}.png`;
        const request:TweetRequest = {
          from: ensFrom ?? from,
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
    */
  }

}
