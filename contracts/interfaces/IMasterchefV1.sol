// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import {IERC20} from "./IERC20.sol";

interface IMasterchefV1 {

    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. SUSHIs to distribute per block.
        uint256 lastRewardBlock; // Last block number that SUSHIs distribution occurs.
        uint256 accSushiPerShare; // Accumulated SUSHIs per share, times 1e12. See below.
    }

    function poolInfo(uint256 _pid) external returns (PoolInfo calldata);
    function deposit(uint256 _pid, uint256 _amount) external;
}