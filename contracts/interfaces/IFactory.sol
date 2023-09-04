// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

interface IFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}