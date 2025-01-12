// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../access/IOwnable.sol";
import "./IFeeManager.sol";
import "../../libraries/DepositStruct.sol";

/// @dev External interface of FeeManagerFactory declared to support ERC165 detection.
interface IFeeManagerFactory is IOwnable, IERC165 {
    /// @notice Emits when a new FeeManager instance has been created for a client
    /// @param _newFeeManagerAddress address of the newly created FeeManager contract instance
    /// @param _clientAddress address of the client for whom the new instance was created
    /// @param _referenceFeeManager The address of the reference implementation of FeeManager used as the basis for clones
    /// @param _clientBasisPoints client basis points (percent * 100)
    event FeeManagerCreated(
        address indexed _newFeeManagerAddress,
        address indexed _clientAddress,
        address indexed _referenceFeeManager,
        uint96 _clientBasisPoints
    );

    /// @notice Emits when a new GatewayEth2Deposit contract address has been set.
    /// @param _GatewayEth2Deposit the address of the new GatewayEth2Deposit contract
    event GatewayEth2DepositSet(address indexed _GatewayEth2Deposit);

    /// @notice Emits when a new value of defaultClientBasisPoints has been set.
    /// @param _defaultClientBasisPoints new value of defaultClientBasisPoints
    event DefaultClientBasisPointsSet(uint96 _defaultClientBasisPoints);

    /// @notice Should be a FeeManager contract
    /// @param _passedAddress passed address that does not support IFeeManager interface
    error NotFeeManager(address _passedAddress);

    /// @notice Should be a GatewayEth2Deposit contract
    /// @param _passedAddress passed address that does not support IGatewayEth2Deposit interface
    error NotGatewayEth2Deposit(address _passedAddress);

    /// @notice Reference FeeManager should be set before calling `createFeeManager`
    error ReferenceFeeManagerNotSet();

    /// @notice caller should be owner, operator, or GatewayEth2Deposit contract
    /// @param _caller calling address
    error CallerNotAuthorized(address _caller);

    /// @notice Default client basis points should be >= 0 and <= 10000
    /// @param _defaultClientBasisPoints passed incorrect default client basis points
    error InvalidDefaultClientBasisPoints(uint96 _defaultClientBasisPoints);

    /// @notice Creates a FeeManager instance for a client
    /// @dev _referrerConfig can be zero if there is no referrer.
    ///
    /// @param _referenceFeeManager The address of the reference implementation of FeeManager used as the basis for clones
    /// @param _clientConfig address and basis points (percent * 100) of the client
    /// @param _referrerConfig address and basis points (percent * 100) of the referrer.
    /// @return newFeeManagerAddress user FeeManager instance that has just been deployed
    function createFeeManager(
        address _referenceFeeManager,
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) external returns (address newFeeManagerAddress);

    /// @notice Computes the address of a FeeManager created by `createFeeManager` function
    /// @dev FeeManager instances are guaranteed to have the same address if all of
    /// 1) referenceFeeManager 2) clientConfig 3) referrerConfig
    /// are the same
    /// @param _referenceFeeManager The address of the reference implementation of FeeManager used as the basis for clones
    /// @param _clientConfig address and basis points (percent * 100) of the client
    /// @param _referrerConfig address and basis points (percent * 100) of the referrer.
    /// @return address user FeeManager instance that will be or has been deployed
    function predictFeeManagerAddress(
        address _referenceFeeManager,
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) external view returns (address);

    /// @notice Returns an array of client FeeManagers
    /// @param _client client address
    /// @return address[] array of client FeeManagers
    function allClientFeeManagers(
        address _client
    ) external view returns (address[] memory);

    /// @notice Returns an array of all FeeManagers for all clients
    /// @return address[] array of all FeeManagers
    function allFeeManagers() external view returns (address[] memory);

    /// @notice The address of GatewayEth2Deposit
    /// @return address of GatewayEth2Deposit
    function gatewayEth2Deposit() external view returns (address);

    /// @notice Returns default client basis points
    /// @return default client basis points
    function defaultClientBasisPoints() external view returns (uint96);

    /// @notice Returns the current operator
    /// @return address of the current operator
    function operator() external view returns (address);

    /// @notice Reverts if the passed address is neither operator nor owner
    /// @param _address passed address
    function checkOperatorOrOwner(address _address) external view;

    /// @notice Reverts if the passed address is not gatewayEth2Deposit
    /// @param _address passed address
    function checkGatewayEth2Deposit(address _address) external view;

    /// @notice Reverts if the passed address is neither of: 1) operator 2) owner 3) GatewayEth2Deposit
    /// @param _address passed address
    function checkOperatorOrOwnerOrGatewayEth2Deposit(
        address _address
    ) external view;
}
