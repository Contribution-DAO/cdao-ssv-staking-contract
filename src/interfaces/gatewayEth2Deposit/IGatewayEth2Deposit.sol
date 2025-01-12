// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../feeManager/IFeeManager.sol";
import "../../libraries/DepositStruct.sol";

/// @dev External interface of IGatewayEth2Deposit declared to support ERC165 detection.
interface IGatewayEth2Deposit is IERC165 {
    /// @notice Emits when a client adds ETH for staking
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @param _sender address who sent ETH
    /// @param _feeManagerInstance address of FeeManager instance that determines the terms of staking service
    /// @param _eth2WithdrawalCredentials ETH Deposit withdrawal credentials
    /// @param _amount sent amount of ETH in wei
    /// @param _expiration block timestamp after which the client will be able to get a refund
    /// @param _ethAmountPerValidatorInWei amount of ETH to deposit per 1 validator (should be >= 32 and <= 2048)
    /// @param _extraData any other data to pass to the event listener
    event ClientEthAdded(
        bytes32 indexed _depositId,
        address indexed _sender,
        address indexed _feeManagerInstance,
        bytes32 _eth2WithdrawalCredentials,
        uint256 _amount,
        uint40 _expiration,
        uint96 _ethAmountPerValidatorInWei,
        bytes _extraData
    );

    /// @notice Emits when a refund has been sent to the client
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @param _feeManagerInstance address of FeeManager instance that was associated with the client deposit
    /// @param _client address who received the refunded ETH
    /// @param _amount refunded amount of ETH in wei
    event Refund(
        bytes32 indexed _depositId,
        address indexed _feeManagerInstance,
        address indexed _client,
        uint256 _amount
    );

    /// @notice Emits when Operator has made ETH Deposit deposits with client funds and withdrawal credentials
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @param _validatorCount number of validators that has been created
    event Eth2Deposit(bytes32 indexed _depositId, uint256 _validatorCount);

    /// @notice Emits when all the available ETH has been forwarded to Beacon DepositContract
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    event Eth2DepositCompleted(bytes32 indexed _depositId);

    /// @notice Emits when some (but not all) of the available ETH has been forwarded to Beacon DepositContract
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    event Eth2DepositInProgress(bytes32 indexed _depositId);

    /// @notice Emits when Operator rejects the service for a given FeeManager client instance.
    /// The client can get a full refund immediately in this case.
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @param _reason optional reason why Operator decided not to provide service
    event ServiceRejected(bytes32 indexed _depositId, string _reason);

    /// @notice Emits when EIP-7251 has been enabled
    event Eip7251Enabled();

    /// @notice Could not send ETH. Most likely, the receiver is a contract rejecting ETH.
    /// @param _receiver receiver address
    /// @param _amount amount of ETH is wei
    error FailedToSendEth(address _receiver, uint256 _amount);

    /// @notice Deposits must be at least 1 ETH.
    error NoSmallDeposits();

    /// @notice Only client can call refund
    /// @param _caller address calling refund
    /// @param _client actual client address who should be calling
    error CallerNotClient(address _caller, address _client);

    /// @notice Only operator can call refund
    /// @param _caller address calling refund
    /// @param _operator actual operator address who should be calling
    error CallerNotEthDepositorOperator(address _caller, address _operator);

    /// @notice There is no ETH associated with the provided FeeManager instance address
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    error InsufficientBalance(bytes32 _depositId);

    /// @notice Should wait for block timestamp to become greater than expiration to ask for a refund
    /// @param _expiration block timestamp after which the client will be able to get a refund
    /// @param _now block timestamp at the time of the actual call
    error WaitForExpiration(uint40 _expiration, uint40 _now);

    /// @notice you can deposit only 1 to 400 validators per transaction
    error ValidatorCountError();

    /// @notice the amount of ETH does not match the amount of validators
    error EtherValueError();

    /// @notice amount of parameters do no match
    error AmountOfParametersError();

    /// @notice do not send ETH directly here
    error DoNotSendEthDirectlyHere();

    /// @notice Most likely, the client is a contract rejecting ETH.
    /// @param _client client address
    error ClientNotAcceptingEth(address _client);

    /// @notice _referenceFeeManager should implement IFeeManager interface
    /// @param _passedAddress passed address for _referenceFeeManager
    error NotFeeManager(address _passedAddress);

    /// @notice Should be a FeeManagerFactory contract
    /// @param _passedAddress passed address that does not support IFeeManagerFactory interface
    error NotFactory(address _passedAddress);

    /// @notice There is no active deposit for the given FeeManager instance
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    error NoDepositToReject(bytes32 _depositId);

    /// @notice Cannot proceed because a deposit for this FeeManager instance has already been rejected
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    error ShouldNotBeRejected(bytes32 _depositId);

    /// @notice Caller should be EIP-7251 enabler (contract deployer)
    /// @param _caller caller address
    /// @param _eip7251Enabler EIP-7251 enabler address
    error CallerNotEip7251Enabler(address _caller, address _eip7251Enabler);

    /// @notice EIP-7251 has not been enabled yet.
    error Eip7251NotEnabledYet();

    /// @notice ETH amount per validator must be >= 32 ETH and <= 2048 ETH
    /// @param _ethAmountPerValidatorInWei passed ETH amount per validator in wei
    error EthAmountPerValidatorInWeiOutOfRange(
        uint256 _ethAmountPerValidatorInWei
    );

    /// @notice Withdrawal credentials prefix must be either 0x01 or 0x02
    error IncorrectWithdrawalCredentialsPrefix(bytes1 _passedPrefix);

    /// @notice Withdrawal credentials bytes 2 - 12 must be zero
    error WithdrawalCredentialsBytesNotZero(bytes32 _eth2WithdrawalCredentials);

    /// @notice make makeBeaconDeposit work with custom deposit amount
    /// @dev Callable by deployer
    /// @dev Should be called after Pectra hardfork
    function enableEip7251() external;

    /// @notice Send unlimited amount of ETH along with the fixed terms of staking service
    /// Callable by clients
    /// @param _eth2WithdrawalCredentials ETH Deposit withdrawal credentials
    /// @param _ethAmountPerValidatorInWei amount of ETH to deposit per 1 validator (should be >= 32 and <= 2048)
    /// @param _referenceFeeManager address of FeeManager template that determines the terms of staking service
    /// @param _operatorAddress address of the operator
    /// @param _clientConfig address and basis points (percent * 100) of the client
    /// @param _referrerConfig address and basis points (percent * 100) of the referrer.
    /// @param _extraData any other data to pass to the event listener
    /// @return depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @return feeManagerInstance client FeeManager instance
    function addEth(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _referenceFeeManager,
        address _operatorAddress,
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig,
        bytes calldata _extraData
    ) external payable returns (bytes32 depositId, address feeManagerInstance);

    /// @notice Reject the service for a given ID of client deposit.
    /// @dev Allows the client to avoid waiting for expiration to get a refund.
    /// @dev Can be helpful if the client made a mistake while adding ETH.
    /// @dev Callable by Operator
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @param _reason optional reason why Operator decided not to provide service
    function rejectService(
        bytes32 _depositId,
        string calldata _reason
    ) external;

    /// @notice refund the unused for staking ETH after the expiration timestamp.
    /// If not called, all multiples of 32 ETH will be used for staking eventually.
    /// @param _eth2WithdrawalCredentials ETH Deposit withdrawal credentials
    /// @param _ethAmountPerValidatorInWei amount of ETH to deposit per 1 validator (should be >= 32 and <= 2048)
    /// @param _feeManagerInstance client FeeManager instance that has non-zero ETH amount (can be checked by `depositAmount`)
    function refund(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _feeManagerInstance
    ) external;

    /// @notice Send ETH to ETH Deposit DepositContract on behalf of the client. Callable by Operator
    /// @param _eth2WithdrawalCredentials ETH Deposit withdrawal credentials
    /// @param _ethAmountPerValidatorInWei amount of ETH to deposit per 1 validator (should be >= 32 and <= 2048)
    /// @param _feeManagerInstance user FeeManager instance that determines the terms of staking service
    /// @param _pubkeys BLS12-381 public keys
    /// @param _signatures BLS12-381 signatures
    /// @param _depositDataRoots SHA-256 hashes of the SSZ-encoded DepositData objects
    function makeBeaconDeposit(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _feeManagerInstance,
        bytes[] calldata _pubkeys,
        bytes[] calldata _signatures,
        bytes32[] calldata _depositDataRoots
    ) external;

    /// @notice Returns the total contract ETH balance in wei
    /// @return uint256 total contract ETH balance in wei
    function totalBalance() external view returns (uint256);

    /// @notice Returns the ID of client deposit
    /// @param _eth2WithdrawalCredentials ETH Deposit withdrawal credentials
    /// @param _ethAmountPerValidatorInWei amount of ETH to deposit per 1 validator (should be >= 32 and <= 2048)
    /// @param _feeManagerInstance user FeeManager instance that determines the terms of staking service
    /// @return bytes32 deposit ID
    function getDepositId(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _feeManagerInstance
    ) external pure returns (bytes32);

    /// @notice Returns the ID of client deposit
    /// @param _eth2WithdrawalCredentials ETH Deposit withdrawal credentials
    /// @param _ethAmountPerValidatorInWei amount of ETH to deposit per 1 validator (should be >= 32 and <= 2048)
    /// @param _referenceFeeManager address of FeeManager template that determines the terms of staking service
    /// @param _clientConfig address and basis points (percent * 100) of the client
    /// @param _referrerConfig address and basis points (percent * 100) of the referrer.
    /// @return bytes32 deposit ID
    function getDepositId(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _referenceFeeManager,
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) external view returns (bytes32);

    /// @notice Returns the amount of ETH in wei that is associated with a client FeeManager instance
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @return uint112 amount of ETH in wei
    function depositAmount(bytes32 _depositId) external view returns (uint112);

    /// @notice Returns the block timestamp after which the client will be able to get a refund
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @return uint40 block timestamp
    function depositExpiration(
        bytes32 _depositId
    ) external view returns (uint40);

    /// @notice Returns the status of the deposit
    /// @param _depositId ID of client deposit (derived from ETH Deposit WithdrawalCredentials, ETH amount per validator in wei, fee distributor instance address)
    /// @return ClientDepositStatus status
    function depositStatus(
        bytes32 _depositId
    ) external view returns (ClientDepositStatus);
}
