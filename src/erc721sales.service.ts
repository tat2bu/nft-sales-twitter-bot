import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

import { BigNumber, ethers } from 'ethers';
import { hexToNumberString } from 'web3-utils';
import erc721abi from './abi/erc721.json'
import dotenv from 'dotenv';
dotenv.config();

import looksRareABI from './abi/looksRareABI.json';

import { config } from './config';
import { BaseService, TweetRequest, TweetType } from './base.service';

const tokenContractAddress = config.contract_address;
const looksRareContractAddress = '0x59728544b08ab483533076417fbbb2fd0b17ce3a'; // Don't change unless deprecated

const looksInterface = new ethers.utils.Interface(looksRareABI);

// This can be an array if you want to filter by multiple topics
// 'Transfer' topic
const topics = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

@Injectable()
export class Erc721SalesService extends BaseService {
  
  fiatValues: any;
  provider = this.getWeb3Provider();

  constructor(
    protected readonly http: HttpService
  ) {
    super(http)
    this.getEthToFiat().subscribe((fiat) => this.fiatValues = fiat.ethereum);
    

    // Listen for Transfer event
    this.provider.on({ address: tokenContractAddress, topics: [topics] }, (event) => {
      this.getTransactionDetails(event).then((res) => {
        if (!res) return
        // Only tweet transfers with value (Ignore w2w transfers)
        if (res?.ether || res?.alternateValue) this.tweet(res);
        // If free mint is enabled we can tweet 0 value
        else if (config.includeFreeMint) this.tweet(res);
        // console.log(res);
      });
    });
  /*
    const tokenContract = new ethers.Contract(config.contract_address, erc721abi, this.provider);
    let filter = tokenContract.filters.Transfer();
    tokenContract.queryFilter(filter, 15024882, 15024883).then(events => {
      for (const event of events) {
        this.getTransactionDetails(event).then((res) => {
          if (!res) return
          console.log(res)
          // Only tweet transfers with value (Ignore w2w transfers)
          if (res?.ether || res?.alternateValue) this.tweet(res);
          // If free mint is enabled we can tweet 0 value
          else if (config.includeFreeMint) this.tweet(res);
          // console.log(res);
        });     
      }
    });
    */
  }

  async getTransactionDetails(tx: any): Promise<any> {

    let tokenId: string;

    try {

      // Get addresses of seller / buyer from topics
      let from = ethers.utils.defaultAbiCoder.decode(['address'], tx?.topics[1])[0];
      let to = ethers.utils.defaultAbiCoder.decode(['address'], tx?.topics[2])[0];

      // ignore internal gemswap transfers
      if (to.toLowerCase() === '0x83c8f28c26bf6aaca652df1dbbe0e1b56f8baba2' ||
          to.toLowerCase() === '0xae9c73fd0fd237c1c6f66fe009d24ce969e98704') {
        return
      }
      // Get tokenId from topics
      tokenId = hexToNumberString(tx?.topics[3]);

      // Get transaction hash
      const { transactionHash } = tx;
      const isMint = BigNumber.from(from).isZero();

      // Get transaction
      const transaction = await this.provider.getTransaction(transactionHash);
      const { value } = transaction;
      const ether = ethers.utils.formatEther(value.toString());

      // Get transaction receipt
      const receipt: any = await this.provider.getTransactionReceipt(transactionHash);

      // Get token image
      const imageUrl = await this.getTokenMetadata(tokenId);

      // Check if LooksRare & parse the event & get the value
      let alternateValue = 0;
      const LR = receipt.logs.map((log: any) => {
        if (log.address.toLowerCase() === looksRareContractAddress.toLowerCase()) {  
          return looksInterface.parseLog(log);
        }
      }).filter((log: any) => log?.name === 'TakerAsk' || log?.name === 'TakerBid');
      const NFTX = receipt.logs.map((log: any) => {
        if (log.topics[0].toLowerCase() === '0x1cdb5ee3c47e1a706ac452b89698e5e3f2ff4f835ca72dde8936d0f4fcf37d81') {  
          const relevantData = log.data.substring(2);
          const relevantDataSlice = relevantData.match(/.{1,64}/g);
          return BigInt(`0x${relevantDataSlice[1]}`) / BigInt('1000000000000000');
        }
      }).filter(n => n !== undefined)
      const NLL = receipt.logs.map((log: any) => {
        if (log.topics[0].toLowerCase() === '0x975c7be5322a86cddffed1e3e0e55471a764ac2764d25176ceb8e17feef9392c') {
          const relevantData = log.data.substring(2);
          return BigInt(`0x${relevantData}`) / BigInt('1000000000000000')
        }
      }).filter(n => n !== undefined)
      const X2Y2 = receipt.logs.map((log: any) => {
        if (log.topics[0].toLowerCase() === '0x3cbb63f144840e5b1b0a38a7c19211d2e89de4d7c5faf8b2d3c1776c302d1d33') {
          const data = log.data.substring(2);
          const dataSlices = data.match(/.{1,64}/g);
          const amount = BigInt(`0x${dataSlices[12]}`) / BigInt('1000000000000000');
          return amount
        }
      }).filter(n => n !== undefined)  
      const OPENSEA_BID = receipt.logs.map((log: any) => {
        if (log.topics[0].toLowerCase() === '0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31') {
          const data = log.data.substring(2);
          const dataSlices = data.match(/.{1,64}/g);
          const amount = (BigInt(`0x${dataSlices[18]}`) + BigInt(`0x${dataSlices[13]}`) + BigInt(`0x${dataSlices[23]}`)) / BigInt('1000000000000000')
          return amount
        }
      }).filter(n => n !== undefined)      

      if (LR.length) {
        const weiValue = (LR[0]?.args?.price)?.toString();
        const value = ethers.utils.formatEther(weiValue);
        alternateValue = parseFloat(value);
      } else if (NFTX.length) {
        // find the number of token transferred to adjust amount per token
        const relevantTransferTopic = receipt.logs.filter((t) => {
          if (t.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            && t.topics[2] === '0x000000000000000000000000b39185e33e8c28e0bb3dbbce24da5dea6379ae91') {
            return true;
          }
          return false;
        });        
        alternateValue = parseFloat(NFTX[0])/relevantTransferTopic.length/1000;
      } else if (NLL.length) {
        alternateValue = parseFloat(NLL[0])/1000;
      } else if (X2Y2.length) {
        alternateValue = parseFloat(X2Y2[0])/1000;
      } else if (OPENSEA_BID.length) {
        alternateValue = parseFloat(OPENSEA_BID[0])/1000;
      }

      // If ens is configured, get ens addresses
      let ensTo: string;
      let ensFrom: string;
      if (config.ens) {
        ensTo = await this.provider.lookupAddress(`${to}`);
        ensFrom = await this.provider.lookupAddress(`${from}`);
      }

      // Set the values for address to & from -- Shorten non ens
      to = config.ens ? (ensTo ? ensTo : this.shortenAddress(to)) : this.shortenAddress(to);
      from = (isMint && config.includeFreeMint) ? 'Mint' : config.ens ? (ensFrom ? ensFrom : this.shortenAddress(from)) : this.shortenAddress(from);

      // Create response object
      const tweetRequest: TweetRequest = {
        from,
        to,
        tokenId,
        ether: parseFloat(ether),
        transactionHash,
        alternateValue,
        type: TweetType.SALE
      };

      // If the image was successfully obtained
      if (imageUrl) tweetRequest.imageUrl = imageUrl;

      return tweetRequest;

    } catch (err) {
      console.log(`${tokenId} failed to send`);
      return null;
    }
  }

}
