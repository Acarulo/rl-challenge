import {
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import fs from "fs";

describe("Wallet tests", () => {

    const addresses = {
        router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
        chefV1: "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd",
        chefV2: "0xEF0881eC094552b2e128Cf945EF17a6752B4Ec5d",
        tokens: {
            weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            convex: "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B"
        },
    };

    const errOwnable = "Ownable: caller is not the owner";

    async function initSetup() {
        const [deployer, Alice] = await ethers.getSigners();

        const WalletContract = await ethers.getContractFactory("SushiswapWallet");
        const wallet = await WalletContract.connect(deployer).deploy(addresses.tokens.weth, addresses.router, addresses.chefV1, addresses.chefV2);
        
        return {deployer, Alice, wallet};
    }

    async function buyToken(connector: any, tokenAddress: string, ethInputAmount: BigInt) {
        const uniswap = new (ethers as any).Contract("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", JSON.parse(fs.readFileSync("test/abis/routerV2.json").toString()), connector);
        await uniswap.connect(connector).swapExactETHForTokens(0, [addresses.tokens.weth, tokenAddress], connector.address, 20000000000000, {value: ethInputAmount});
    }

    async function wrapEther(connector: any, ethInputAmount: BigInt) {
        const weth = new (ethers as any).Contract(addresses.tokens.weth, JSON.parse(fs.readFileSync("test/abis/weth.json").toString()), connector);
        await weth.connect(connector).deposit({value: ethInputAmount});
    }

    describe("When deploying", () => {
        it("Owner should be the deployer", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            expect(await wallet.owner()).to.equal(deployer.address);
        });

        it("State variables should match the constructor arguments", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            
            expect(await wallet.weth()).to.equal(addresses.tokens.weth);
            expect(await wallet.sushiRouter()).to.equal(addresses.router);
            expect(await wallet.masterchefV1()).to.equal(addresses.chefV1);
            expect(await wallet.masterchefV2()).to.equal(addresses.chefV2);
        });

        it("Should revert if any of the constructor args is the null address", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            const WalletContractToFail = await ethers.getContractFactory("SushiswapWallet");

            await expect(WalletContractToFail.connect(deployer).deploy(ethers.ZeroAddress, addresses.router, addresses.chefV1, addresses.chefV2)).to.be.revertedWithCustomError(WalletContractToFail, "NullAddress");
            await expect(WalletContractToFail.connect(deployer).deploy(addresses.tokens.weth, ethers.ZeroAddress, addresses.chefV1, addresses.chefV2)).to.be.revertedWithCustomError(WalletContractToFail, "NullAddress");
            await expect(WalletContractToFail.connect(deployer).deploy(addresses.tokens.weth, addresses.router, ethers.ZeroAddress, addresses.chefV2)).to.be.revertedWithCustomError(WalletContractToFail, "NullAddress");
            await expect(WalletContractToFail.connect(deployer).deploy(addresses.tokens.weth, addresses.router, addresses.chefV1, ethers.ZeroAddress)).to.be.revertedWithCustomError(WalletContractToFail, "NullAddress");
        });
    });

    describe("When adding liquidity to farm on Chef V1", () => {
        it("Should revert when called from a third party", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);

            const addParamsETH = {
                tokenA: addresses.tokens.usdt,
                amountTokenA: ethers.parseUnits("500", 6),
                amountETH: ethers.parseEther("0.3067"),
                amountTokenAMin: ethers.parseUnits("450", 6),
                amountETHMin: ethers.parseEther("0.25"),
                toChefV1: true,
                poolId: "0"
            };
            
            const addParams = {
                tokenA: addresses.tokens.weth,
                tokenB: addresses.tokens.usdt,
                amountTokenA: ethers.parseEther("0.40"),
                amountTokenB: ethers.parseUnits("500", 6),
                amountTokenAMin: ethers.parseEther("0.25"),
                amountTokenBMin: ethers.parseUnits("450", 6),
                toChefV1: true,
                poolId: "0"
            };   
            
            await expect(wallet.connect(Alice).addLiquidity(addParams)).to.be.revertedWith(errOwnable);
            await expect(wallet.connect(Alice).addLiquidityETH(addParamsETH)).to.be.revertedWith(errOwnable);
        });

        it("Should revert if farming pool ID does not match the pair address", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);

            const addParamsETH = {
                tokenA: addresses.tokens.usdt,
                amountTokenA: ethers.parseUnits("500", 6),
                amountETH: ethers.parseEther("0.3067"),
                amountTokenAMin: ethers.parseUnits("450", 6),
                amountETHMin: ethers.parseEther("0.25"),
                toChefV1: true,
                poolId: "3"
            };
            
            const addParams = {
                tokenA: addresses.tokens.weth,
                tokenB: addresses.tokens.usdt,
                amountTokenA: ethers.parseEther("0.40"),
                amountTokenB: ethers.parseUnits("500", 6),
                amountTokenAMin: ethers.parseEther("0.25"),
                amountTokenBMin: ethers.parseUnits("450", 6),
                toChefV1: true,
                poolId: "4"
            };   
            
            await expect(wallet.connect(deployer).addLiquidity(addParams)).to.be.revertedWithCustomError(wallet, "PoolIdMismatch");
            await expect(wallet.connect(deployer).addLiquidityETH(addParamsETH)).to.be.revertedWithCustomError(wallet, "PoolIdMismatch");            
        });

        it("Happy path for ETH-USDT on ChefV1 - pool at index 0", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            const usdt = new (ethers as any).Contract(addresses.tokens.usdt, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 

            await buyToken(deployer, addresses.tokens.usdt, ethers.parseEther("1"));
            await deployer.sendTransaction({to: await wallet.getAddress(), value: ethers.parseEther("1")});
            await usdt.connect(deployer).transfer(await wallet.getAddress(), ethers.parseUnits("500", 6));

            const addParams = {
                tokenA: addresses.tokens.usdt,
                amountTokenA: ethers.parseUnits("500", 6),
                amountETH: ethers.parseEther("0.3067"),
                amountTokenAMin: ethers.parseUnits("450", 6),
                amountETHMin: ethers.parseEther("0.25"),
                toChefV1: true,
                poolId: "0"
            };

            console.log("Adding liquidity...");
            await wallet.connect(deployer).addLiquidityETH(addParams);
            console.log("ETH-USDT liquidity added and staked into chef v1");
        });

        it("Happy path for wETH-USDT on ChefV1 - pool at index 0, now both are tokens", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            
            const weth = new (ethers as any).Contract(addresses.tokens.weth, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 
            const usdt = new (ethers as any).Contract(addresses.tokens.usdt, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 

            await wrapEther(deployer, ethers.parseEther("1"));
            await buyToken(deployer, addresses.tokens.usdt, ethers.parseEther("1"));

            await weth.connect(deployer).transfer(await wallet.getAddress(), ethers.parseEther("1"));
            await usdt.connect(deployer).transfer(await wallet.getAddress(), ethers.parseUnits("500", 6));
            
            const addParams = {
                tokenA: addresses.tokens.weth,
                tokenB: addresses.tokens.usdt,
                amountTokenA: ethers.parseEther("0.40"),
                amountTokenB: ethers.parseUnits("500", 6),
                amountTokenAMin: ethers.parseEther("0.25"),
                amountTokenBMin: ethers.parseUnits("450", 6),
                toChefV1: true,
                poolId: "0"
            };
            
            console.log("Adding liquidity...");
            await wallet.connect(deployer).addLiquidity(addParams);
            console.log("wETH-USDT liquidity added and staked into chef v1");       
        });

        it("Successful ETH + token allocation should update local and masterchef state variables as expected", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            const usdt = new (ethers as any).Contract(addresses.tokens.usdt, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 
            const chefV1 = new (ethers as any).Contract(addresses.chefV1, JSON.parse(fs.readFileSync("test/abis/masterchefV1.json").toString()), deployer);

            await buyToken(deployer, addresses.tokens.usdt, ethers.parseEther("1"));
            await deployer.sendTransaction({to: await wallet.getAddress(), value: ethers.parseEther("1")});
            await usdt.connect(deployer).transfer(await wallet.getAddress(), ethers.parseUnits("500", 6));

            const addParams = {
                tokenA: addresses.tokens.usdt,
                amountTokenA: ethers.parseUnits("500", 6),
                amountETH: ethers.parseEther("0.3067"),
                amountTokenAMin: ethers.parseUnits("450", 6),
                amountETHMin: ethers.parseEther("0.25"),
                toChefV1: true,
                poolId: "0"
            };

            expect(await wallet.chefV1PoolLiquidity(addParams.poolId)).to.equal('0');
            expect((await chefV1.userInfo(addParams.poolId, await wallet.getAddress())).amount).to.equal("0");

            await wallet.connect(deployer).addLiquidityETH(addParams);
            expect(await wallet.chefV1PoolLiquidity("0")).to.be.greaterThan("0");
            expect(await wallet.chefV1PoolLiquidity("0")).to.equal((await chefV1.userInfo(addParams.poolId, await wallet.getAddress())).amount);
        });

        it("Successful two-tokens allocation should update local state variables as expected", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            
            const weth = new (ethers as any).Contract(addresses.tokens.weth, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 
            const usdt = new (ethers as any).Contract(addresses.tokens.usdt, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 
            const chefV1 = new (ethers as any).Contract(addresses.chefV1, JSON.parse(fs.readFileSync("test/abis/masterchefV1.json").toString()), deployer);

            await wrapEther(deployer, ethers.parseEther("1"));
            await buyToken(deployer, addresses.tokens.usdt, ethers.parseEther("1"));
      
            await weth.connect(deployer).transfer(await wallet.getAddress(), ethers.parseEther("1"));
            await usdt.connect(deployer).transfer(await wallet.getAddress(), ethers.parseUnits("500", 6));
            
            const addParams = {
                tokenA: addresses.tokens.weth,
                tokenB: addresses.tokens.usdt,
                amountTokenA: ethers.parseEther("0.40"),
                amountTokenB: ethers.parseUnits("500", 6),
                amountTokenAMin: ethers.parseEther("0.25"),
                amountTokenBMin: ethers.parseUnits("450", 6),
                toChefV1: true,
                poolId: "0"
            };
            
            expect(await wallet.chefV1PoolLiquidity(addParams.poolId)).to.equal('0');
            expect((await chefV1.userInfo(addParams.poolId, await wallet.getAddress())).amount).to.equal("0");

            await wallet.connect(deployer).addLiquidity(addParams);
            expect(await wallet.chefV1PoolLiquidity(addParams.poolId)).to.be.greaterThan("0");
            expect(await wallet.chefV1PoolLiquidity(addParams.poolId)).to.equal((await chefV1.userInfo(addParams.poolId, await wallet.getAddress())).amount);
        });

        it("Adding ETH + a single token should emit LiquidityDepositedAndStaked event", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            const usdt = new (ethers as any).Contract(addresses.tokens.usdt, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 

            await buyToken(deployer, addresses.tokens.usdt, ethers.parseEther("1"));
            await deployer.sendTransaction({to: await wallet.getAddress(), value: ethers.parseEther("1")});
            await usdt.connect(deployer).transfer(await wallet.getAddress(), ethers.parseUnits("500", 6));

            const addParams = {
                tokenA: addresses.tokens.usdt,
                amountTokenA: ethers.parseUnits("500", 6),
                amountETH: ethers.parseEther("0.3067"),
                amountTokenAMin: ethers.parseUnits("450", 6),
                amountETHMin: ethers.parseEther("0.25"),
                toChefV1: true,
                poolId: "0"
            };

            expect(await wallet.connect(deployer).addLiquidityETH(addParams)).to.emit(wallet, "LiquidityDepositedAndStaked");
        });

        it("Adding two-token liquidity should emit LiquidityDepositedAndStaked event", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            
            const weth = new (ethers as any).Contract(addresses.tokens.weth, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 
            const usdt = new (ethers as any).Contract(addresses.tokens.usdt, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 

            await wrapEther(deployer, ethers.parseEther("1"));
            await buyToken(deployer, addresses.tokens.usdt, ethers.parseEther("1"));
      
            await weth.connect(deployer).transfer(await wallet.getAddress(), ethers.parseEther("1"));
            await usdt.connect(deployer).transfer(await wallet.getAddress(), ethers.parseUnits("500", 6));

            const addParams = {
                tokenA: addresses.tokens.weth,
                tokenB: addresses.tokens.usdt,
                amountTokenA: ethers.parseEther("0.40"),
                amountTokenB: ethers.parseUnits("500", 6),
                amountTokenAMin: ethers.parseEther("0.25"),
                amountTokenBMin: ethers.parseUnits("450", 6),
                toChefV1: true,
                poolId: "0"
            };
            
            expect(await wallet.connect(deployer).addLiquidity(addParams)).to.emit(wallet, "LiquidityDepositedAndStaked");
        });
    });

    describe("When adding liquidity to farm on Chef V2", () => {
        it("Should revert when called from a third party", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);

            const addParamsETH = {
                tokenA: addresses.tokens.convex,
                amountTokenA: ethers.parseEther("0.95"),
                amountETH: ethers.parseEther("0.0015"),
                amountTokenAMin: ethers.parseEther("0.90"),
                amountETHMin: ethers.parseEther("0.001"),
                toChefV1: false,
                poolId: "1"
            };         

            const addParams = {
                tokenA: addresses.tokens.convex,
                tokenB: addresses.tokens.weth,
                amountTokenA: ethers.parseEther("0.95"),
                amountTokenB: ethers.parseEther("0.0015"),
                amountTokenAMin: ethers.parseEther("0.90"),
                amountTokenBMin: ethers.parseEther("0.001"),
                toChefV1: false,
                poolId: "1"
            };

            await expect(wallet.connect(Alice).addLiquidity(addParams)).to.be.revertedWith(errOwnable);
            await expect(wallet.connect(Alice).addLiquidityETH(addParamsETH)).to.be.revertedWith(errOwnable);
        });

        it("Should revert if farming pool ID does not match the pair address", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);

            const addParamsETH = {
                tokenA: addresses.tokens.convex,
                amountTokenA: ethers.parseEther("0.95"),
                amountETH: ethers.parseEther("0.0015"),
                amountTokenAMin: ethers.parseEther("0.90"),
                amountETHMin: ethers.parseEther("0.001"),
                toChefV1: false,
                poolId: "5"
            };         

            const addParams = {
                tokenA: addresses.tokens.convex,
                tokenB: addresses.tokens.weth,
                amountTokenA: ethers.parseEther("0.95"),
                amountTokenB: ethers.parseEther("0.0015"),
                amountTokenAMin: ethers.parseEther("0.90"),
                amountTokenBMin: ethers.parseEther("0.001"),
                toChefV1: false,
                poolId: "8"
            };  
            
            await expect(wallet.connect(deployer).addLiquidity(addParams)).to.be.revertedWithCustomError(wallet, "PoolIdMismatch");
            await expect(wallet.connect(deployer).addLiquidityETH(addParamsETH)).to.be.revertedWithCustomError(wallet, "PoolIdMismatch");            
        });

        it("Happy path for ETH-CONVEX on ChefV2 - pool at index 1", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            const convex = new (ethers as any).Contract(addresses.tokens.convex, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 

            await buyToken(deployer, addresses.tokens.convex, ethers.parseEther("1"));

            await deployer.sendTransaction({to: await wallet.getAddress(), value: ethers.parseEther("1")});
            await convex.connect(deployer).transfer(await wallet.getAddress(), ethers.parseEther("0.95"));

            const addParams = {
                tokenA: addresses.tokens.convex,
                amountTokenA: ethers.parseEther("0.95"),
                amountETH: ethers.parseEther("0.0015"),
                amountTokenAMin: ethers.parseEther("0.90"),
                amountETHMin: ethers.parseEther("0.001"),
                toChefV1: false,
                poolId: "1"
            };

            console.log("Adding liquidity...");
            await wallet.connect(deployer).addLiquidityETH(addParams);
            console.log("ETH-CONVEX liquidity added and staked into chef v2");            
        });

        it("Happy path for wETH-CONVEX on ChefV2 - pool at index 1, now both are tokens", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            
            const weth = new (ethers as any).Contract(addresses.tokens.weth, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 
            const convex = new (ethers as any).Contract(addresses.tokens.convex, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 

            await wrapEther(deployer, ethers.parseEther("1"));
            await buyToken(deployer, addresses.tokens.convex, ethers.parseEther("1"));

            await weth.connect(deployer).transfer(await wallet.getAddress(), ethers.parseEther("1"));
            await convex.connect(deployer).transfer(await wallet.getAddress(),  ethers.parseEther("0.95"));

            const addParams = {
                tokenA: addresses.tokens.convex,
                tokenB: addresses.tokens.weth,
                amountTokenA: ethers.parseEther("0.95"),
                amountTokenB: ethers.parseEther("0.0015"),
                amountTokenAMin: ethers.parseEther("0.90"),
                amountTokenBMin: ethers.parseEther("0.001"),
                toChefV1: false,
                poolId: "1"
            };
            
            console.log("Adding liquidity...");
            await wallet.connect(deployer).addLiquidity(addParams);
            console.log("wETH-CONVEX liquidity added and staked into chef v2");       
        });

        it("Successful ETH + token allocation should update local and masterchef state variables as expected", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            const convex = new (ethers as any).Contract(addresses.tokens.convex, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 
            const chefV2 = new (ethers as any).Contract(addresses.chefV2, JSON.parse(fs.readFileSync("test/abis/masterchefV2.json").toString()), deployer);

            await buyToken(deployer, addresses.tokens.convex, ethers.parseEther("1"));

            await deployer.sendTransaction({to: await wallet.getAddress(), value: ethers.parseEther("1")});
            await convex.connect(deployer).transfer(await wallet.getAddress(), ethers.parseEther("0.95"));

            const addParams = {
                tokenA: addresses.tokens.convex,
                amountTokenA: ethers.parseEther("0.95"),
                amountETH: ethers.parseEther("0.0015"),
                amountTokenAMin: ethers.parseEther("0.90"),
                amountETHMin: ethers.parseEther("0.001"),
                toChefV1: false,
                poolId: "1"
            };

            expect(await wallet.chefV2PoolLiquidity(addParams.poolId)).to.equal('0');
            expect((await chefV2.userInfo(addParams.poolId, await wallet.getAddress())).amount).to.equal("0");

            await wallet.connect(deployer).addLiquidityETH(addParams);

            expect(await wallet.chefV2PoolLiquidity(addParams.poolId)).to.be.greaterThan("0");
            expect(await wallet.chefV2PoolLiquidity(addParams.poolId)).to.equal((await chefV2.userInfo(addParams.poolId, await wallet.getAddress())).amount);
        });

        it("Successful two-tokens allocation should update local state variables as expected", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            
            const weth = new (ethers as any).Contract(addresses.tokens.weth, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 
            const convex = new (ethers as any).Contract(addresses.tokens.convex, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 
            const chefV2 = new (ethers as any).Contract(addresses.chefV2, JSON.parse(fs.readFileSync("test/abis/masterchefV2.json").toString()), deployer);

            await wrapEther(deployer, ethers.parseEther("1"));
            await buyToken(deployer, addresses.tokens.convex, ethers.parseEther("1"));
      
            await weth.connect(deployer).transfer(await wallet.getAddress(), ethers.parseEther("1"));
            await convex.connect(deployer).transfer(await wallet.getAddress(),  ethers.parseEther("0.95"));
            
            const addParams = {
                tokenA: addresses.tokens.convex,
                tokenB: addresses.tokens.weth,
                amountTokenA: ethers.parseEther("0.95"),
                amountTokenB: ethers.parseEther("0.0015"),
                amountTokenAMin: ethers.parseEther("0.90"),
                amountTokenBMin: ethers.parseEther("0.001"),
                toChefV1: false,
                poolId: "1"
            };
            
            expect(await wallet.chefV2PoolLiquidity(addParams.poolId)).to.equal('0');
            expect((await chefV2.userInfo(addParams.poolId, await wallet.getAddress())).amount).to.equal("0");

            await wallet.connect(deployer).addLiquidity(addParams);
            expect(await wallet.chefV2PoolLiquidity(addParams.poolId)).to.be.greaterThan("0");
            expect(await wallet.chefV2PoolLiquidity(addParams.poolId)).to.equal((await chefV2.userInfo(addParams.poolId, await wallet.getAddress())).amount);
        });

        it("Adding ETH + a single token should emit LiquidityDepositedAndStaked event", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            const convex = new (ethers as any).Contract(addresses.tokens.convex, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 

            await buyToken(deployer, addresses.tokens.convex, ethers.parseEther("1"));

            await deployer.sendTransaction({to: await wallet.getAddress(), value: ethers.parseEther("1")});
            await convex.connect(deployer).transfer(await wallet.getAddress(), ethers.parseEther("0.95"));

            const addParams = {
                tokenA: addresses.tokens.convex,
                amountTokenA: ethers.parseEther("0.95"),
                amountETH: ethers.parseEther("0.0015"),
                amountTokenAMin: ethers.parseEther("0.90"),
                amountETHMin: ethers.parseEther("0.001"),
                toChefV1: false,
                poolId: "1"
            };

            expect(await wallet.connect(deployer).addLiquidityETH(addParams)).to.emit(wallet, "LiquidityDepositedAndStaked");
        });

        it("Adding two-token liquidity should emit LiquidityDepositedAndStaked event", async() => {
            const {deployer, Alice, wallet} = await loadFixture(initSetup);
            
            const weth = new (ethers as any).Contract(addresses.tokens.weth, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 
            const convex = new (ethers as any).Contract(addresses.tokens.convex, JSON.parse(fs.readFileSync("test/abis/erc20.json").toString()), deployer); 

            await wrapEther(deployer, ethers.parseEther("1"));
            await buyToken(deployer, addresses.tokens.convex, ethers.parseEther("1"));
      
            await weth.connect(deployer).transfer(await wallet.getAddress(), ethers.parseEther("1"));
            await convex.connect(deployer).transfer(await wallet.getAddress(),  ethers.parseEther("0.95"));
            
            const addParams = {
                tokenA: addresses.tokens.convex,
                tokenB: addresses.tokens.weth,
                amountTokenA: ethers.parseEther("0.95"),
                amountTokenB: ethers.parseEther("0.0015"),
                amountTokenAMin: ethers.parseEther("0.90"),
                amountTokenBMin: ethers.parseEther("0.001"),
                toChefV1: false,
                poolId: "1"
            };
            
            expect(await wallet.connect(deployer).addLiquidity(addParams)).to.emit(wallet, "LiquidityDepositedAndStaked");
        });
    });
});
