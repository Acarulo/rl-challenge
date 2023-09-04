# Wallet contract to add liquidity and farm liquidity tokens on Sushiswap.

The SushiswapWallet allows the deployer to own a smart contract that can receive and manage ETH and ERC20 tokens.
The Wallet is allowed to receive both ETH and any ERC20-compliant token, which in turn will be used to add liquidity and farm SLPs.
Once the ETH/ERC20 balance is sent to the contract, the user can call one of the two available external methods:

* addLiquidityETH: adds ETH + ERC20 balance on a liquidity pair and farms the resulting SLP balance on either chef V1 or V2.
* addLiquidity: adds balances from two ERC20 tokens on a liquidity pair and farms the resulting SLP balance on either chef V1 or V2.

Both methods are callable by the contract owner, which in turn points to the deployer.
The contract holds a set of internal functions intended to make both public methods logic more amiable, in line with best practices.

The hardhat config file forks Ethereum mainnet in order to test this implementation.
No .env file is required.

Tests for the contract implementation can be found at test/SushiswapWallet.ts.
In order to run the tests, you can simply type "npm run test" from the command prompt -after cloning and installing the dependencies.

Cheers!