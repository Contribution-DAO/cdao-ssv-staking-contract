// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {ISSVNetworkCore} from "./ISSVNetworkCore.sol";

/// @dev https://github.com/ssvlabs/ssv-network/blob/2e90a0cc44ae2645ea06ef9c0fcd2369bbf3c277/contracts/interfaces/ISSVOperators.sol
interface ISSVOperators is ISSVNetworkCore {
    /// @notice Registers a new operator
    /// @dev For backward compatibility testing
    /// @param publicKey The public key of the operator
    /// @param fee The operator's fee (SSV)
    function registerOperator(bytes calldata publicKey, uint256 fee) external returns (uint64);

    /// @notice Registers a new operator
    /// @param publicKey The public key of the operator
    /// @param fee The operator's fee (SSV)
    /// @param setPrivate Flag indicating whether the operator should be set as private or not
    function registerOperator(bytes calldata publicKey, uint256 fee, bool setPrivate) external returns (uint64);

    /// @notice Removes an existing operator
    /// @param operatorId The ID of the operator to be removed
    function removeOperator(uint64 operatorId) external;

    /// @notice Sets the whitelist for an operator
    /// @dev For backward compatibility testing
    /// @param operatorId The ID of the operator
    /// @param whitelisted The address to be whitelisted
    function setOperatorWhitelist(uint64 operatorId, address whitelisted) external;

    /// @notice Declares the operator's fee
    /// @param operatorId The ID of the operator
    /// @param fee The fee to be declared (SSV)
    function declareOperatorFee(uint64 operatorId, uint256 fee) external;

    /// @notice Executes the operator's fee
    /// @param operatorId The ID of the operator
    function executeOperatorFee(uint64 operatorId) external;

    /// @notice Cancels the declared operator's fee
    /// @param operatorId The ID of the operator
    function cancelDeclaredOperatorFee(uint64 operatorId) external;

    /// @notice Reduces the operator's fee
    /// @param operatorId The ID of the operator
    /// @param fee The new Operator's fee (SSV)
    function reduceOperatorFee(uint64 operatorId, uint256 fee) external;

    /// @notice Withdraws operator earnings
    /// @param operatorId The ID of the operator
    /// @param tokenAmount The amount of tokens to withdraw (SSV)
    function withdrawOperatorEarnings(uint64 operatorId, uint256 tokenAmount) external;

    /// @notice Withdraws all operator earnings
    /// @param operatorId The ID of the operator
    function withdrawAllOperatorEarnings(uint64 operatorId) external;

    /// @notice Set the list of operators as private without checking for any whitelisting address
    /// @notice The operators are considered private when registering validators
    /// @param operatorIds The operator IDs to set as private
    function setOperatorsPrivateUnchecked(uint64[] calldata operatorIds) external;

    /// @notice Set the list of operators as public without removing any whitelisting address
    /// @notice The operators still keep its adresses whitelisted (external contract or EOAs/generic contracts)
    /// @notice The operators are considered public when registering validators
    /// @param operatorIds The operator IDs to set as public
    function setOperatorsPublicUnchecked(uint64[] calldata operatorIds) external;

    /**
     * @dev Emitted when a new operator has been added.
     * @param operatorId operator's ID.
     * @param owner Operator's ethereum address that can collect fees.
     * @param publicKey Operator's public key. Will be used to encrypt secret shares of validators keys.
     * @param fee Operator's fee.
     */
    event OperatorAdded(uint64 indexed operatorId, address indexed owner, bytes publicKey, uint256 fee);

    /**
     * @dev Emitted when operator has been removed.
     * @param operatorId operator's ID.
     */
    event OperatorRemoved(uint64 indexed operatorId);

    event OperatorFeeDeclared(address indexed owner, uint64 indexed operatorId, uint256 blockNumber, uint256 fee);

    event OperatorFeeDeclarationCancelled(address indexed owner, uint64 indexed operatorId);
    /**
     * @dev Emitted when an operator's fee is updated.
     * @param owner Operator's owner.
     * @param blockNumber from which block number.
     * @param fee updated fee value.
     */
    event OperatorFeeExecuted(address indexed owner, uint64 indexed operatorId, uint256 blockNumber, uint256 fee);
    event OperatorWithdrawn(address indexed owner, uint64 indexed operatorId, uint256 value);
    event FeeRecipientAddressUpdated(address indexed owner, address recipientAddress);

    /**
     * @dev Emitted when the operators changed its privacy status
     * @param operatorIds operators' IDs.
     * @param toPrivate Flag that indicates if the operators are being set to private (true) or public (false).
     */
    event OperatorPrivacyStatusUpdated(uint64[] operatorIds, bool toPrivate);
}
