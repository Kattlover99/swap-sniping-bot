import dotenv from 'dotenv';
import express from 'express';
import chalk from 'chalk';
import ethers, { Contract, utils, Wallet, providers } from 'ethers';

dotenv.config();
const app = express();

const data = {
  WBNB: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // wbnb
  to_PURCHASE: process.env.TOKEN_TO_PURCHASE,
  factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350C73', // PancakeSwap V2 factory
  router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap V2 router
  recipient: process.env.WALLET_ADDRESS,
  AMOUNT_OF_WBNB: process.env.AMOUNT_OF_WBNB,
  Slippage: process.env.SLIPPAGE, // in Percentage
  gasPrice: '5', // in gwei
  gasLimit: '345684', // at least 21000
};

let initialLiquidityDetected = false;

const bscMainnetUrl = 'https://bsc-dataseed.binance.org/';
const privatekey = process.env.PRIVATE_KEY;
const provider = new providers.JsonRpcProvider(bscMainnetUrl);
const wallet = new Wallet(privatekey);
const account = wallet.connect(provider);

const factory = new Contract(
  data.factory,
  ['function getPair(address tokenA, address tokenB) external view returns (address pair)'],
  account
);

const router = new Contract(
  data.router,
  [
    'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  ],
  account
);

const pairAddress = async (tokenIn, tokenOut) => {
  return await factory.getPair(tokenIn, tokenOut);
};

const createPairContract = (pairAddress) => {
  return new Contract(pairAddress, ['event Mint(address indexed sender, uint amount0, uint amount1)'], account);
};

const getAmountOutMin = async (amountIn, tokenIn, tokenOut) => {
  const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
  return amounts[1].sub(amounts[1].div(`${data.Slippage}`));
};

const processTransaction = async (amountIn, amountOutMin, tokenIn, tokenOut) => {
  console.log(
    chalk.green.inverse(`Liquidity Addition Detected\n`) +
    `Buying Token
     =================
     tokenIn: ${amountIn.toString()} ${tokenIn} (WBNB)
     tokenOut: ${amountOutMin.toString()} ${tokenOut}
   `
  );

  console.log('Processing Transaction.....');
  console.log(chalk.yellow(`amountIn: ${amountIn}`));
  console.log(chalk.yellow(`amountOutMin: ${amountOutMin}`));
  console.log(chalk.yellow(`tokenIn: ${tokenIn}`));
  console.log(chalk.yellow(`tokenOut: ${tokenOut}`));
  console.log(chalk.yellow(`data.recipient: ${data.recipient}`));
  console.log(chalk.yellow(`data.gasLimit: ${data.gasLimit}`));
  console.log(chalk.yellow(`data.gasPrice: ${utils.parseUnits(`${data.gasPrice}`, 'gwei')}`));

  const tx = await router.swapExactTokensForTokens(
    amountIn,
    amountOutMin,
    [tokenIn, tokenOut],
    data.recipient,
    Date.now() + 1000 * 60 * 10, // 10 minutes
    {
      gasLimit: data.gasLimit,
      gasPrice: utils.parseUnits(`${data.gasPrice}`, 'gwei'),
    }
  );

  const receipt = await tx.wait();
  console.log('Transaction receipt');
  console.log(receipt);
};

const run = async () => {
  const tokenIn = data.WBNB;
  const tokenOut = data.to_PURCHASE;
  const pairAddress = await pairAddress(tokenIn, tokenOut);

  console.log(pairAddress);

  const pair = createPairContract(pairAddress);

  pair.on('Mint', async (sender, amount0, amount1) => {
    if (initialLiquidityDetected === true) {
      return;
    }

    initialLiquidityDetected = true;

    const amountIn = utils.parseUnits(`${data.AMOUNT_OF_WBNB}`, 'ether');
    const amountOutMin = await getAmountOutMin(amountIn, tokenIn, tokenOut);

    await processTransaction(amountIn, amountOutMin, tokenIn, tokenOut);
  });
};

run();

const PORT = 5000;

app.listen(PORT, () => {
  console.log(chalk.yellow(`Listening for Liquidity Addition to token ${data.to_PURCHASE}`));
});
