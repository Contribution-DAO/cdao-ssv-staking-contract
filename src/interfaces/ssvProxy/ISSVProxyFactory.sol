// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "../../interfaces/ssv-network/ISSVNetwork.sol";
import "../../interfaces/ssv-network/external/ISSVWhitelistingContract.sol";
import "../access/IOwnableWithOperator.sol";
import "../../libraries/DepositStruct.sol";
import "../../constants/StakingConstants.sol";

/// @dev External interface of SSVProxyFactory
interface ISSVProxyFactory is
    ISSVWhitelistingContract,
    IOwnableWithOperator,
    IERC165
{
    /// @notice Emits when batch registration of validator with SSV is completed
    /// @param _proxy address of SSVProxy that was used for registration and became the cluster owner
    event RegistrationCompleted(address indexed _proxy);

    /// @notice Emits when a new SSVProxy instance was deployed and initialized
    /// @param _ssvProxy newly deployed SSVProxy instance address
    /// @param _client client address
    /// @param _feeManager FeeManager instance address
    event SSVProxyCreated(
        address indexed _ssvProxy,
        address indexed _client,
        address indexed _feeManager
    );

    /// @notice Emits when a new reference FeeManager has been set
    /// @param _referenceFeeManager new reference FeeManager address
    event ReferenceFeeManagerSet(address indexed _referenceFeeManager);

    /// @notice Emits when a new value for maximum amount of SSV tokens per validator has been set
    /// @param _maxSsvTokenAmountPerValidator new value for maximum amount of SSV tokens per validator
    event MaxSsvTokenAmountPerValidatorSet(
        uint112 _maxSsvTokenAmountPerValidator
    );

    /// @notice Emits when a new reference SSVProxy has been set
    /// @param _referenceSSVProxy new reference SSVProxy address
    event ReferenceSSVProxySet(address indexed _referenceSSVProxy);

    /// @notice Emits when new selectors were allowed for clients
    /// @param _selectors newly allowed selectors
    event AllowedSelectorsForClientSet(bytes4[] _selectors);

    /// @notice Emits when selectors were disallowed for clients
    /// @param _selectors disallowed selectors
    event AllowedSelectorsForClientRemoved(bytes4[] _selectors);

    /// @notice Emits when new selectors were allowed for operator
    /// @param _selectors newly allowed selectors
    event AllowedSelectorsForOperatorSet(bytes4[] _selectors);

    /// @notice Emits when selectors were disallowed for operator
    /// @param _selectors disallowed selectors
    event AllowedSelectorsForOperatorRemoved(bytes4[] _selectors);

    /// @notice Emits when client deposited their ETH for SSV staking
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @param _operator address who sent ETH
    /// @param _ssvProxy address of the client instance of SSVProxy
    /// @param _eth2WithdrawalCredentials ETH Deposit WithdrawalCredentials
    /// @param _clientAddress address of the client
    /// @param _referrerAddress address of the referrer
    /// @param _feeManagerInstance address of the client instance of FeeManager
    /// @param _ethAmountInWei amount of deposited ETH in wei
    event EthForSsvStakingDeposited(
        bytes32 indexed _depositId,
        address indexed _operator,
        address indexed _ssvProxy,
        bytes32 _eth2WithdrawalCredentials,
        address _clientAddress,
        address _referrerAddress,
        address _feeManagerInstance,
        uint256 _ethAmountInWei
    );

    /// @notice Passed address is not a valid GatewayDepositor
    /// @param _passedAddress Passed address
    error NotGatewayEth2Deposit(address _passedAddress);

    /// @notice Passed address is not a valid FeeManagerFactory
    /// @param _passedAddress Passed address
    error NotFeeManagerFactory(address _passedAddress);

    /// @notice Passed address is not a valid FeeManager
    /// @param _passedAddress Passed address
    error NotFeeManager(address _passedAddress);

    /// @notice Passed address is not a valid SSVProxy
    /// @param _passedAddress Passed address
    error NotSSVProxy(address _passedAddress);

    /// @notice ETH value passed with the transaction must be equal to 32 times validator count
    /// @param _actualEthValue actually sent ETH value
    error EthValueMustBe32TimesValidatorCount(uint256 _actualEthValue);

    /// @notice Maximum amount of SSV tokens per validator must be >= 10^12 and <= 10^24
    error MaxSsvTokenAmountPerValidatorOutOfRange();

    /// @notice Maximum amount of SSV tokens per validator has not been set. Cannot do depositEthAndRegisterValidators without it.
    error MaxSsvTokenAmountPerValidatorNotSet();

    /// @notice Cannot use token amount per validator larger than Maximum amount of SSV tokens per validator.
    error MaxSsvTokenAmountPerValidatorExceeded();

    /// @notice Should pass at least 1 selector
    error CannotSetZeroSelectors();

    /// @notice Should pass at least 1 selector
    error CannotRemoveZeroSelectors();

    /// @notice There should equal number of pubkeys, signatures, and depositDataRoots
    /// @param _ssvValidatorsLength validators list length
    /// @param _signaturesLength signatures list length
    /// @param _depositDataRootsLength depositDataRoots list length
    error DepositDataArraysShouldHaveTheSameLength(
        uint256 _ssvValidatorsLength,
        uint256 _signaturesLength,
        uint256 _depositDataRootsLength
    );

    /// @notice SSVProxy should have already been deployed for the given FeeManager instance
    /// @param _feeManagerInstance client FeeManager instance
    error SSVProxyDoesNotExist(address _feeManagerInstance);

    /// @notice Set Maximum amount of SSV tokens per validator that is allowed for client to deposit during `depositEthAndRegisterValidators`
    /// @param _maxSsvTokenAmountPerValidator Maximum amount of SSV tokens per validator
    function setMaxSsvTokenAmountPerValidator(
        uint112 _maxSsvTokenAmountPerValidator
    ) external;

    /// @notice Set template to be used for new SSVProxy instances
    /// @param _referenceSSVProxy template to be used for new SSVProxy instances
    function setReferenceSSVProxy(address _referenceSSVProxy) external;

    /// @notice Allow selectors (function signatures) for clients to call on SSVNetwork via SSVProxy
    /// @param _selectors selectors (function signatures) to allow for clients
    function setAllowedSelectorsForClient(
        bytes4[] calldata _selectors
    ) external;

    /// @notice Disallow selectors (function signatures) for clients to call on SSVNetwork via SSVProxy
    /// @param _selectors selectors (function signatures) to disallow for clients
    function removeAllowedSelectorsForClient(
        bytes4[] calldata _selectors
    ) external;

    /// @notice Allow selectors (function signatures) for operator to call on SSVNetwork via SSVProxy
    /// @param _selectors selectors (function signatures) to allow for operator
    function setAllowedSelectorsForOperator(
        bytes4[] calldata _selectors
    ) external;

    /// @notice Disallow selectors (function signatures) for operator to call on SSVNetwork via SSVProxy
    /// @param _selectors selectors (function signatures) to disallow for operator
    function removeAllowedSelectorsForOperator(
        bytes4[] calldata _selectors
    ) external;

    /// @notice Set template to be used for new FeeManager instances
    /// @param _referenceFeeManager template to be used for new FeeManager instances
    function setReferenceFeeManager(address _referenceFeeManager) external;

    /// @notice Computes the address of a SSVProxy created by `_createSSVProxy` function
    /// @dev SSVProxy instances are guaranteed to have the same address if _feeManagerInstance is the same
    /// @param _feeManagerInstance The address of FeeManager instance
    /// @return address client SSVProxy instance that will be or has been deployed
    function predictSSVProxyAddress(
        address _feeManagerInstance
    ) external view returns (address);

    /// @notice Computes the address of a SSVProxy created by `_createSSVProxy` function
    /// @param _referenceFeeManager The address of the reference implementation of FeeManager used as the basis for clones
    /// @param _clientConfig address and basis points (percent * 100) of the client
    /// @param _referrerConfig address and basis points (percent * 100) of the referrer.
    /// @return address client SSVProxy instance that will be or has been deployed
    function predictSSVProxyAddress(
        address _referenceFeeManager,
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) external view returns (address);

    /// @notice Computes the address of a SSVProxy for the default referenceFeeManager
    /// @param _clientConfig address and basis points (percent * 100) of the client
    /// @param _referrerConfig address and basis points (percent * 100) of the referrer.
    /// @return address client SSVProxy instance that will be or has been deployed
    function predictSSVProxyAddress(
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) external view returns (address);

    /// @notice Computes the address of a SSVProxy for the default referenceFeeManager and referrerConfig
    /// @param _clientConfig address and basis points (percent * 100) of the client
    /// @return address client SSVProxy instance that will be or has been deployed
    function predictSSVProxyAddress(
        FeeRecipient calldata _clientConfig
    ) external view returns (address);

    /// @notice Deploy SSVProxy instance if not deployed before
    /// @param _feeManagerInstance The address of FeeManager instance
    /// @return ssvProxyInstance client SSVProxy instance that has been deployed
    function createSSVProxy(
        address _feeManagerInstance
    ) external returns (address ssvProxyInstance);

    /// @notice Deposit unlimited amount of ETH for SSV staking
    /// @dev Callable by clients
    /// @param _eth2WithdrawalCredentials ETH Deposit withdrawal credentials
    /// @param _ethAmountPerValidatorInWei amount of ETH to deposit per 1 validator (should be >= 32 and <= 2048)
    /// @param _clientConfig address and basis points (percent * 100) of the client
    /// @param _referrerConfig address and basis points (percent * 100) of the referrer.
    /// @param _extraData any other data to pass to the event listener
    /// @return depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @return feeManagerInstance client FeeManager instance
    /// @return ssvProxy client SSVProxy instance that became the SSV cluster owner
    function addEth(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig,
        bytes calldata _extraData
    )
        external
        payable
        returns (
            bytes32 depositId,
            address feeManagerInstance,
            address ssvProxy
        );

    /// @notice Send ETH to ETH Deposit DepositContract on behalf of the client and register validators with SSV (up to 60, calldata size is the limit)
    /// @dev Callable by Operator only.
    /// @param _eth2WithdrawalCredentials ETH Deposit withdrawal credentials
    /// @param _ethAmountPerValidatorInWei amount of ETH to deposit per 1 validator (should be >= 32 and <= 2048)
    /// @param _feeManagerInstance user FeeManager instance that determines the terms of staking service
    /// @param _depositData signatures and depositDataRoots from Beacon deposit data
    /// @param _operatorIds SSV operator IDs
    /// @param _publicKeys validator public keys
    /// @param _sharesData encrypted shares related to the validator
    /// @param _amount amount of ERC-20 SSV tokens to deposit into the cluster
    /// @param _cluster SSV cluster
    /// @return ssvProxy client SSVProxy instance that became the SSV cluster owner
    function makeBeaconDepositsAndRegisterValidators(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _feeManagerInstance,
        DepositData calldata _depositData,
        uint64[] calldata _operatorIds,
        bytes[] calldata _publicKeys,
        bytes[] calldata _sharesData,
        uint256 _amount,
        ISSVNetwork.Cluster calldata _cluster
    ) external returns (address ssvProxy);

    /// @notice Deposit SSV tokens from SSVProxyFactory to SSV cluster
    /// @dev Can only be called by SSVProxyFactory owner
    /// @param _clusterOwner SSV cluster owner (usually, SSVProxy instance)
    /// @param _tokenAmount SSV token amount to be deposited
    /// @param _operatorIds SSV operator IDs
    /// @param _cluster SSV cluster
    function depositToSSV(
        address _clusterOwner,
        uint256 _tokenAmount,
        uint64[] calldata _operatorIds,
        ISSVNetwork.Cluster calldata _cluster
    ) external;

    /// @notice Returns the FeeManagerFactory address
    /// @return FeeManagerFactory address
    function getFeeManagerFactory() external view returns (address);

    /// @notice A list of addresses of the deployed client SSVProxy instances by client address
    /// @param _client client address
    /// @return A list of addresses of the deployed client SSVProxy instances
    function getAllClientSsvProxies(
        address _client
    ) external view returns (address[] memory);

    /// @notice Returns a list of all ever deployed client SSVProxy instances
    /// @return a list of all ever deployed client SSVProxy instances
    function getAllSsvProxies() external view returns (address[] memory);

    /// @notice Returns if a certain selector (function signature) is allowed for clients to call on SSVNetwork via SSVProxy
    /// @return True if allowed
    function isClientSelectorAllowed(
        bytes4 _selector
    ) external view returns (bool);

    /// @notice Returns if a certain selector (function signature) is allowed for a operator to call on SSVNetwork via SSVProxy
    /// @param _selector selector (function signature)
    /// @return True if allowed
    function isOperatorSelectorAllowed(
        bytes4 _selector
    ) external view returns (bool);

    /// @notice Returns a set of addresses of SSV operator owners (both Operator and partners)
    /// @return a set of addresses of SSV operator owners (both Operator and partners)
    function getAllowedSsvOperatorOwners()
        external
        view
        returns (address[] memory);

    /// @notice Returns a template set by Operator to be used for new FeeManager instances
    /// @return a template set by Operator to be used for new FeeManager instances
    function getReferenceFeeManager() external view returns (address);

    /// @notice Returns a template set by Operator to be used for new SSVProxy instances
    /// @return a template set by Operator to be used for new SSVProxy instances
    function getReferenceSSVProxy() external view returns (address);

    /// @notice Returns the maximum amount of SSV tokens per validator that is allowed for client to deposit during `depositEthAndRegisterValidators`
    /// @return maximum amount of SSV tokens per validator
    function getMaxSsvTokenAmountPerValidator() external view returns (uint112);
}
