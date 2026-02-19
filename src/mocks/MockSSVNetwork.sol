// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../interfaces/ssv-network/ISSVNetworkCore.sol";

/// @title Mock SSV Network for testing ETH-based payments
/// @dev Implements the key functions called by SSVProxy and SSVProxyFactory
contract MockSSVNetwork {
    // Track calls for test verification
    uint256 public registerValidatorCallCount;
    uint256 public bulkRegisterValidatorCallCount;
    uint256 public depositCallCount;
    uint256 public withdrawCallCount;
    uint256 public migrateClusterToETHCallCount;
    uint256 public setFeeRecipientCallCount;
    uint256 public bulkExitValidatorCallCount;
    uint256 public reactivateCallCount;

    // Track ETH received
    uint256 public totalEthReceived;

    // Last call data for verification
    address public lastFeeRecipient;
    address public lastDepositOwner;
    uint256 public lastDepositEthAmount;
    uint256 public lastWithdrawAmount;

    // Events for tracking
    event MockRegisterValidator(bytes publicKey, uint256 ethValue);
    event MockBulkRegisterValidator(uint256 keyCount, uint256 ethValue);
    event MockDeposit(address owner, uint256 ethValue);
    event MockWithdraw(uint256 tokenAmount);
    event MockMigrateClusterToETH(uint256 ethValue);
    event MockSetFeeRecipient(address recipient);
    event MockBulkExitValidator(uint256 keyCount);
    event MockReactivate(uint256 ethValue);

    receive() external payable {}

    function registerValidator(
        bytes calldata publicKey,
        uint64[] memory,
        bytes calldata,
        ISSVNetworkCore.Cluster memory
    ) external payable {
        registerValidatorCallCount++;
        totalEthReceived += msg.value;
        emit MockRegisterValidator(publicKey, msg.value);
    }

    function bulkRegisterValidator(
        bytes[] calldata publicKeys,
        uint64[] memory,
        bytes[] calldata,
        ISSVNetworkCore.Cluster memory
    ) external payable {
        bulkRegisterValidatorCallCount++;
        totalEthReceived += msg.value;
        emit MockBulkRegisterValidator(publicKeys.length, msg.value);
    }

    function deposit(
        address owner,
        uint64[] memory,
        ISSVNetworkCore.Cluster memory
    ) external payable {
        depositCallCount++;
        totalEthReceived += msg.value;
        lastDepositOwner = owner;
        lastDepositEthAmount = msg.value;
        emit MockDeposit(owner, msg.value);
    }

    function withdraw(
        uint64[] memory,
        uint256 tokenAmount,
        ISSVNetworkCore.Cluster memory
    ) external {
        withdrawCallCount++;
        lastWithdrawAmount = tokenAmount;
        emit MockWithdraw(tokenAmount);
    }

    function reactivate(
        uint64[] memory,
        ISSVNetworkCore.Cluster memory
    ) external payable {
        reactivateCallCount++;
        totalEthReceived += msg.value;
        emit MockReactivate(msg.value);
    }

    function migrateClusterToETH(
        uint64[] memory,
        ISSVNetworkCore.Cluster memory
    ) external payable {
        migrateClusterToETHCallCount++;
        totalEthReceived += msg.value;
        emit MockMigrateClusterToETH(msg.value);
    }

    function setFeeRecipientAddress(address feeRecipientAddress) external {
        setFeeRecipientCallCount++;
        lastFeeRecipient = feeRecipientAddress;
        emit MockSetFeeRecipient(feeRecipientAddress);
    }

    function bulkExitValidator(
        bytes[] calldata publicKeys,
        uint64[] calldata
    ) external {
        bulkExitValidatorCallCount++;
        emit MockBulkExitValidator(publicKeys.length);
    }

    function exitValidator(bytes calldata, uint64[] calldata) external {}

    function removeValidator(bytes calldata, uint64[] memory, ISSVNetworkCore.Cluster memory) external {}

    function bulkRemoveValidator(bytes[] calldata, uint64[] memory, ISSVNetworkCore.Cluster memory) external {}

    function liquidate(address, uint64[] memory, ISSVNetworkCore.Cluster memory) external {}

    // ISSVViews stubs (so we can use same address for ssvViews)
    function getBalance(
        address,
        uint64[] memory,
        ISSVNetworkCore.Cluster memory
    ) external pure returns (uint256 balance, uint256 ebBalance) {
        return (0, 0);
    }
}
