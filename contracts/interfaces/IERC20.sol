// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

interface IERC20 {
    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 value) external;
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}