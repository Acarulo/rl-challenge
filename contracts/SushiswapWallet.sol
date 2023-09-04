// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import {IERC20} from "./interfaces/IERC20.sol";
import {IFactory} from "./interfaces/IFactory.sol";
import {IRouter} from "./interfaces/IRouter.sol";
import {IMasterchefV1} from "./interfaces/IMasterchefV1.sol";
import {IMasterchefV2} from "./interfaces/IMasterchefV2.sol";

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

error NullAddress();
error InvalidAddress(address invalid);
error PoolIdMismatch();

struct LiquidityAddition {
    IERC20 tokenA;
    IERC20 tokenB;
    uint256 amountTokenA;
    uint256 amountTokenB;
    uint256 amountTokenAMin;
    uint256 amountTokenBMin;
    bool toChefV1;
    uint256 poolId;
}

struct LiquidityAdditionETH {
    IERC20 tokenA;
    uint256 amountTokenA;
    uint256 amountETH;
    uint256 amountTokenAMin;
    uint256 amountETHMin;
    bool toChefV1;
    uint256 poolId;
}

contract SushiswapWallet is Ownable2Step {

    IERC20 public weth;
    IRouter public sushiRouter;
    IMasterchefV1 public masterchefV1;
    IMasterchefV2 public masterchefV2;

    mapping(uint256 => uint256) public chefV1PoolLiquidity; // Maps from poolId to liquidity added on masterchefV1
    mapping(uint256 => uint256) public chefV2PoolLiquidity; // Maps from poolId to liquidity added on masterchefV2

    event LiquidityDepositedAndStaked(bool chefV1, uint256 pool, uint256 liquidity);

    constructor(IERC20 _weth, IRouter _router, IMasterchefV1 _mv1, IMasterchefV2 _mv2) {
        if (address(_weth) == address(0)) revert NullAddress();
        if (address(_router) == address(0)) revert NullAddress();
        if (address(_mv1) == address(0)) revert NullAddress();
        if (address(_mv2) == address(0)) revert NullAddress();

        weth = _weth;
        sushiRouter = _router;
        masterchefV1 = _mv1;
        masterchefV2 = _mv2;
    }

    /*
     * @dev: provides ETH + single token liquidity on a trading pair and farms the resulting LP balance into a Chef contract.
     * @param LiquidityAdditionETH: a 7-args structure, requiring
     * - tokenA: the token address to which the user will add balance
     * - amountTokenA: the desired token balance to add
     * - amountETH: the desired ETH amount to add
     * - amountTokenAMin: the minimum amount of token to add
     * - amountETHMin: the minimum amount of ETH to add
     * - toChefV1: true if the user wants to farm at masterchef v1, false if target is masterchef v2
     * - poolId: the target pool ID, which should match the SLP address
     * @return the amounts of token and ETH effectively added as liquidity, as well as the receiving liquidity token balance.
    **/
    function addLiquidityETH(LiquidityAdditionETH calldata params) external onlyOwner returns (uint amountToken, uint amountETH, uint liquidity) {
        address pair = IFactory(sushiRouter.factory()).getPair(address(params.tokenA), address(weth)); 
        
        if(_getChefIndexedPoolAddress(params.toChefV1, params.poolId) != pair) revert PoolIdMismatch();
        _approve(params.tokenA, address(sushiRouter), params.amountTokenA);
        
        (amountToken, amountETH, liquidity) = sushiRouter.addLiquidityETH{value: params.amountETH}(
            address(params.tokenA),
            params.amountTokenA,
            params.amountTokenAMin,
            params.amountETHMin,
            address(this),
            block.timestamp
        );

        _approveChefAndStake(pair, params.toChefV1, params.poolId, liquidity);

        emit LiquidityDepositedAndStaked(params.toChefV1, params.poolId, liquidity);
    }

    /*
     * @dev: provides liquidity from both tokens on a trading pair and farms the resulting LP balance into a Chef contract.
     * @param LiquidityAdditionETH: a 8-args structure, requiring
     * - tokenA: the tokenA address to which the user will add balance (should match token0 from router)
     * - tokenB: the tokenB address to which the user will add balance (should match token1 from router)
     * - amountTokenA: the desired tokenA balance to add
     * - amountTokenB: the desired tokenB amount to add
     * - amountTokenAMin: the minimum amount of tokenA to add
     * - amountTokenBMin: the minimum amount of tokenB to add
     * - toChefV1: true if the user wants to farm at masterchef v1, false if target is masterchef v2
     * - poolId: the target pool ID, which should match the SLP address
     * @return the amounts of tokenA and tokenB effectively added as liquidity, as well as the receiving liquidity token balance.
    **/
    function addLiquidity(LiquidityAddition calldata params) external onlyOwner returns (uint amountA, uint amountB, uint liquidity) {
        address pair = IFactory(sushiRouter.factory()).getPair(address(params.tokenA), address(params.tokenB)); 
        
        if(_getChefIndexedPoolAddress(params.toChefV1, params.poolId) != pair) revert PoolIdMismatch();

        _approve(params.tokenA, address(sushiRouter), params.amountTokenA);
        _approve(params.tokenB, address(sushiRouter), params.amountTokenB);

        (amountA, amountB, liquidity) = sushiRouter.addLiquidity(
            address(params.tokenA), 
            address(params.tokenB), 
            params.amountTokenA, 
            params.amountTokenB, 
            params.amountTokenAMin, 
            params.amountTokenB, 
            address(this), 
            block.timestamp
        );

        _approveChefAndStake(pair, params.toChefV1, params.poolId, liquidity);

        emit LiquidityDepositedAndStaked(params.toChefV1, params.poolId, liquidity);
    }

    /*
     * @dev: approves the SLP pair to the Chef contract -if required- and farms the input balance.
     * @param _pair: the SLP pair to approve and farm balance.
     * @param _toChefV1: set to true if the user targets masterchefV1, false if targetting masterchefV2.
     * @param _poolId: the pool ID matching the SLP liquidity balance to be added. 
     * @param _liquidity: the SLP balance to farm.
    **/
    function _approveChefAndStake(address _pair, bool _toChefV1, uint256 _poolId, uint256 _liquidity) internal {
        address targetSpender = _toChefV1 ? address(masterchefV1) : address(masterchefV2);
        _approve(IERC20(_pair), targetSpender, _liquidity);

        if(_toChefV1) {
            chefV1PoolLiquidity[_poolId] = chefV1PoolLiquidity[_poolId] + _liquidity;
            masterchefV1.deposit(_poolId, _liquidity);
        } else {
            chefV2PoolLiquidity[_poolId] = chefV1PoolLiquidity[_poolId] + _liquidity;
            masterchefV2.deposit(_poolId, _liquidity, address(this));
        }
    }

    /*
     * @dev: approves an allowance on a specified ERC20-compliant token to a target spender.
     *       This approval is triggered if current allowance is below threshold.
     * @param token: The ERC20-compliant token which is expected to pass the approval.
     * @param spender: The address which will be allowed to spend the token balance.
     * @param threshold: the minimum value to check against current allowance so as for the approval to be executed.
    **/
    function _approve(IERC20 token, address spender, uint256 threshold) internal {
        if(token.allowance(address(this), spender) < threshold) {
            token.approve(spender, type(uint256).max);
        }
    }

    /*
     * @dev: checks which SLP pair is stored at a certain index position on one of the Chef contracts.
     * @param _toChefV1: set to true if target farming contract is masterchefV1; false if target is masterchefV2.
     * @param _poolId: pool index from target farming contract.
     * @return the address located at _poolId index on the target masterchef contract. 
    **/
    function _getChefIndexedPoolAddress(bool _toChefV1, uint256 _poolId) internal returns (address _pair) {
        _pair = _toChefV1 ? address(masterchefV1.poolInfo(_poolId).lpToken) : address(masterchefV2.lpToken(_poolId));
    }

    receive() external payable {}
}