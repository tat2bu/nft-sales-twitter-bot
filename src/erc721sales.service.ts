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

const looksRareContractAddress = '0x59728544b08ab483533076417fbbb2fd0b17ce3a'; // Don't change unless deprecated

const looksInterface = new ethers.utils.Interface(looksRareABI);

// This can be an array if you want to filter by multiple topics
// 'Transfer' topic
const topics = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

@Injectable()
export class Erc721SalesService extends BaseService {
  
  provider = this.getWeb3Provider();

  constructor(
    protected readonly http: HttpService
  ) {
    super(http)
    
    // Listen for Transfer event
    this.provider.on({ address: config.contract_address, topics: [topics] }, (event) => {
      this.getTransactionDetails(event).then((res) => {
        if (!res) return
        // Only tweet transfers with value (Ignore w2w transfers)
        if (res?.ether || res?.alternateValue) this.tweet(res);
        // If free mint is enabled we can tweet 0 value
        else if (config.includeFreeMint) this.tweet(res);
        // console.log(res);
      });
    });
    //this.provider.resetEventsBlock(15032374)
   
    /*
    const tokenContract = new ethers.Contract(config.contract_address, erc721abi, this.provider);
    let filter = tokenContract.filters.Transfer();
    const startingBlock = 15035738 
    tokenContract.queryFilter(filter, 
      startingBlock, 
      startingBlock+1).then(events => {
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
    // if (tx.transactionHash !== '0xcee5c725e2234fd0704e1408cdf7f71d881e67f8bf5d6696a98fdd7c0bcf52f3') return;
    
    let tokenId: string;

    try {

      // Get addresses of seller / buyer from topics
      let from = ethers.utils.defaultAbiCoder.decode(['address'], tx?.topics[1])[0];
      let to = ethers.utils.defaultAbiCoder.decode(['address'], tx?.topics[2])[0];

      // ignore internal transfers
      if (to.toLowerCase() === '0x83c8f28c26bf6aaca652df1dbbe0e1b56f8baba2' ||
          to.toLowerCase() === '0xae9c73fd0fd237c1c6f66fe009d24ce969e98704' ||
          to.toLowerCase() === '0x81e7c20cc78e045d18eaa33c9fd6c3ff96a54118' ||
          to.toLowerCase() === '0xf97e9727d8e7db7aa8f006d1742d107cf9411412' ||
          to.toLowerCase() === '0x56dd5bbede9bfdb10a2845c4d70d4a2950163044') {
        return
      }
      // not an erc721 transfer
      if (!tx?.topics[3]) return

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
      const imageUrl = config.use_local_images 
        ? `${config.local_image_path}${tokenId.padStart(4, '0')}.png`
        : await this.getTokenMetadata(tokenId);

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
      // ignore NFTX swaps
      for (const log of receipt.logs) {
        if (log.topics[0].toLowerCase() === '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822') {  
          console.log('ignoring nftx swap for', transaction.hash)
          return null
        }
      }
      const NLL = receipt.logs.map((log: any) => {
        if (log.topics[0].toLowerCase() === '0x975c7be5322a86cddffed1e3e0e55471a764ac2764d25176ceb8e17feef9392c') {
          const relevantData = log.data.substring(2);
          return BigInt(`0x${relevantData}`) / BigInt('1000000000000000')
        }
      }).filter(n => n !== undefined)

      const X2Y2 = receipt.logs.map((log: any, index:number) => {
        if (log.topics[0].toLowerCase() === '0x3cbb63f144840e5b1b0a38a7c19211d2e89de4d7c5faf8b2d3c1776c302d1d33') {
          const data = log.data.substring(2);
          const dataSlices = data.match(/.{1,64}/g);
          // find the right token
          if (BigInt(`0x${dataSlices[18]}`).toString() !== tokenId) return;
          let amount = BigInt(`0x${dataSlices[12]}`) / BigInt('1000000000000000');
          if (amount === BigInt(0)) {
            amount = BigInt(`0x${dataSlices[26]}`) / BigInt('1000000000000000');
          }
          return amount
        }
      }).filter(n => n !== undefined)  
      // console.log(tx.hash, tokenId)
      const OPENSEA_BID = receipt.logs.map((log: any) => {
        if (log.topics[0].toLowerCase() === '0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31') {
          const data = log.data.substring(2);
          const dataSlices = data.match(/.{1,64}/g);
          const amounts = []
          // support WETH and ETH
          if (parseInt(dataSlices[8], 16) === 1) {
            amounts.push(
              BigInt(`0x${dataSlices[13]}`),
              BigInt(`0x${dataSlices[18]}`)
            )
            if (dataSlices.length >= 23 ) {
              amounts.push(BigInt(`0x${dataSlices[23]}`))
            }
          } else {
            amounts.push(BigInt(`0x${dataSlices[8]}`))
          }
          console.log(amounts)
          const amount = amounts.reduce((previous,current) => previous + current, BigInt(0)) / BigInt('1000000000000000')
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
      console.log(`${tokenId} failed to send`, err);
      return null;
    }
  }

}
