// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import {IERC20} from "./IERC20.sol";

interface IMasterchefV2 {
    function lpToken(uint256 _pid) external returns (IERC20);
    function deposit(uint256 _pid, uint256 _amount, address _to) external;
}