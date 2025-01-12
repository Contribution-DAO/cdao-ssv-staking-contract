// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

/// @dev Maximal number of ETH Deposit deposits within a single transaction
/// @dev 400 deposits (12800 ETH) is determined by calldata size limit of 128 kb
/// https://ethereum.stackexchange.com/questions/144120/maximum-calldata-size-per-block
uint256 constant VALIDATORS_MAX_AMOUNT = 400;

/// @dev EIP-7251 MIN_ACTIVATION_BALANCE
uint96 constant MIN_ACTIVATION_BALANCE = 32 ether;

/// @dev EIP-7251 MAX_EFFECTIVE_BALANCE
uint96 constant MAX_EFFECTIVE_BALANCE = 2048 ether;

/// @dev Minimal 1 time deposit
uint256 constant MIN_DEPOSIT = 1 ether;

/// @dev Lockup time to allow Services to make ETH Deposit deposits
/// @dev If there is leftover ETH after this time, it can be refunded
uint40 constant TIMEOUT = 1 minutes;

/// @dev Collateral size of 1 validator
uint256 constant COLLATERAL = 32 ether;
