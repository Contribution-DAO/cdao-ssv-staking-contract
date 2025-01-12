// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../../interfaces/ssvProxy/ISSVProxyFactory.sol";
import "../../interfaces/ssv-network/ISSVNetwork.sol";
import "../../libraries/DepositStruct.sol";
import "../access/IOwnableWithOperator.sol";

/// @dev External interface of SSVProxy declared to support ERC165 detection.
interface ISSVProxy is IOwnableWithOperator, IERC165 {
    /// @notice Emits when SSVProxy instance is initialized
    /// @param _feeManager FeeManager instance that determines the identity of this SSVProxy instance
    event Initialized(address indexed _feeManager);

    /// @notice Emits when the function was called successfully on SSVNetwork via fallback
    /// @param _caller caller of SSVProxy
    /// @param _selector selector of the function from SSVNetwork
    event SuccessfullyCalledViaFallback(
        address indexed _caller,
        bytes4 indexed _selector
    );

    /// @notice Emits when an arbitrary external contract has been called by owner via SSVProxy
    /// @param _contract external contract address
    /// @param _selector selector of the called function
    event SuccessfullyCalledExternalContract(
        address indexed _contract,
        bytes4 indexed _selector
    );

    /// @notice _referenceFeeManager should implement IFeeManager interface
    /// @param _passedAddress passed address for _referenceFeeManager
    error NotFeeManager(address _passedAddress);

    /// @notice Should be a SSVProxyFactory contract
    /// @param _passedAddress passed address that does not support ISSVProxyFactory interface
    error NotSSVProxyFactory(address _passedAddress);

    /// @notice Throws if called by any account other than the client.
    /// @param _caller address of the caller
    /// @param _client address of the client
    error CallerNotClient(address _caller, address _client);

    /// @notice The caller was neither operator nor owner nor client
    /// @param _caller address of the caller
    error CallerNeitherOperatorNorOwnerNorClient(address _caller);

    /// @notice Only factory can call `initialize`.
    /// @param _msgSender sender address.
    /// @param _actualFactory the actual factory address that can call `initialize`.
    error NotSSVProxyFactoryCalled(
        address _msgSender,
        ISSVProxyFactory _actualFactory
    );

    /// @notice _pubkeys and _operatorIds arrays should have the same lengths
    error AmountOfParametersError();

    /// @notice Selector is not allowed for the caller.
    /// @param _caller caller address
    /// @param _selector function selector to be called on SSVNetwork
    error SelectorNotAllowed(address _caller, bytes4 _selector);

    /// @notice Initialize the SSVProxy instance
    /// @dev Should only be called by SSVProxyFactory
    /// @param _feeManager FeeManager instance that determines the identity of this SSVProxy instance
    function initialize(address _feeManager) external;

    /// @notice Call an arbitrary external contract with SSVProxy as a msg.sender
    /// @dev Should be called by owner only
    /// @dev This function can help e.g. in claiming airdrops
    /// @param _contract external contract address
    /// @param _calldata calldata for the external contract
    function callAnyContract(
        address _contract,
        bytes calldata _calldata
    ) external;

    /// @notice Registers new validators on the SSV Network
    /// @dev Should be called by SSVProxyFactory only
    /// @param publicKeys The public keys of the new validators
    /// @param operatorIds Array of IDs of operators managing this validator
    /// @param sharesData Encrypted shares related to the new validators
    /// @param amount Amount of SSV tokens to be deposited
    /// @param cluster Cluster to be used with the new validator
    function bulkRegisterValidators(
        bytes[] calldata publicKeys,
        uint64[] calldata operatorIds,
        bytes[] calldata sharesData,
        uint256 amount,
        ISSVNetwork.Cluster calldata cluster
    ) external;

    /// @notice Deposit SSV tokens to SSV clusters
    /// @dev Can be called by anyone
    /// This function is just batching calls for convenience. It's possible to call the same function on SSVNetwork directly
    /// @param _tokenAmount SSV token amount to be deposited
    /// @param _operatorIds SSV operator IDs
    /// @param _clusters SSV clusters
    function depositToSSV(
        uint256 _tokenAmount,
        uint64[] calldata _operatorIds,
        ISSVNetwork.Cluster[] calldata _clusters
    ) external;

    /// @notice Withdraw SSV tokens from SSV clusters to this contract
    /// @dev Should be called by Operator only
    /// This function is just batching calls for convenience. It's always possible to call the same function on SSVNetwork via fallback
    /// @param _tokenAmount SSV token amount to be withdrawn
    /// @param _operatorIds SSV operator IDs
    /// @param _clusters SSV clusters
    function withdrawFromSSV(
        uint256 _tokenAmount,
        uint64[] calldata _operatorIds,
        ISSVNetwork.Cluster[] calldata _clusters
    ) external;

    /// @notice Withdraw SSV tokens from this contract to the given address
    /// @dev Should be called by Operator only
    /// @param _to destination address
    /// @param _amount SSV token amount to be withdrawn
    function withdrawSSVTokens(address _to, uint256 _amount) external;

    /// @notice Withdraw all SSV tokens from this contract to SSVProxyFactory
    /// @dev Should be called by Operator only
    function withdrawAllSSVTokensToFactory() external;

    /// @notice Withdraw SSV tokens from SSV clusters to SSVProxyFactory
    /// @dev Should be called by Operator only
    /// @param _tokenAmount SSV token amount to be withdrawn
    /// @param _operatorIds SSV operator IDs
    /// @param _clusters SSV clusters
    function withdrawFromSSVToFactory(
        uint256 _tokenAmount,
        uint64[] calldata _operatorIds,
        ISSVNetwork.Cluster[] calldata _clusters
    ) external;

    /// @notice Set a new fee recipient address for this contract (cluster owner)
    /// @dev Should be called by Operator only.
    /// Another FeeManager instance can become the fee recipient (e.g. if service percentages change).
    /// Client address itself can become the fee recipient (e.g. if service percentage becomes zero due to some promo).
    /// It's fine for Operator to determine the fee recipient since Operator is paying SSV tokens and EL rewards are a way to compansate for them.
    /// Other operators are compansated via SSV tokens paid by Operator.
    /// @param _feeRecipientAddress fee recipient address to set
    function setFeeRecipientAddress(address _feeRecipientAddress) external;

    /// @notice Fires the exit event for a set of validators
    /// @param publicKeys The public keys of the validators to be exited
    /// @param operatorIds Array of IDs of operators managing the validators
    function bulkExitValidator(
        bytes[] calldata publicKeys,
        uint64[] calldata operatorIds
    ) external;

    /// @notice Returns the client address
    /// @return address client address
    function getClient() external view returns (address);

    /// @notice Returns the factory address
    /// @return address factory address
    function getFactory() external view returns (address);

    /// @notice Returns the address of FeeManager instance accociated with this contract
    /// @return FeeManager instance address
    function getFeeManager() external view returns (address);
}
