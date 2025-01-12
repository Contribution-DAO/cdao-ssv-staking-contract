// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "../libraries/AddressLib.sol";
import "../libraries/DepositStruct.sol";
import "../interfaces/IDepositContract.sol";
import "../interfaces/gatewayEth2Deposit/IGatewayEth2Deposit.sol";
import "../interfaces/feeManager/IFeeManagerFactory.sol";
import "../interfaces/ssvProxy/ISSVProxyFactory.sol";
import "../constants/StakingConstants.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Single entrypoint contract for Validator ETH staking deposits
/// @dev All client sent ETH is temporarily held in this contract until Operator picks it up
/// to further forward to the Beacon (aka ETH Deposit) DepositContract.
/// There are no other ways for any ETH to go from this contract other than to:
/// 1) Beacon DepositContract with client defined withdrawal credentials
/// 2) Client defined withdrawal credentials address itself
contract GatewayEth2Deposit is ERC165, IGatewayEth2Deposit, Ownable {
    /// @notice SSVProxyFactory address
    ISSVProxyFactory private _ssvProxyFactory;

    /// @notice Beacon DepositContract address
    IDepositContract private immutable _depositContract;

    /// @notice FeeManagerFactory address
    IFeeManagerFactory private _feeManagerFactory;

    /// @notice client deposit ID -> (amount, expiration)
    mapping(bytes32 => ClientDeposit) private _deposits;

    /// @notice whether EIP-7251 has been enabled
    bool private _eip7251Enabled;

    /// @dev Set values known at the initial deploy time.
    /// @param feeManagerFactory_ address of FeeManagerFactory
    /// @param depositContract_ address of Native ETH deposit
    constructor(
        address feeManagerFactory_,
        address depositContract_
    ) Ownable(msg.sender) {
        if (
            !ERC165Checker.supportsInterface(
                feeManagerFactory_,
                type(IFeeManagerFactory).interfaceId
            )
        ) {
            revert NotFactory(feeManagerFactory_);
        }

        _feeManagerFactory = IFeeManagerFactory(feeManagerFactory_);

        _depositContract = IDepositContract(depositContract_);
    }

    /// @notice ETH should only be sent to this contract along with the `addEth` function
    receive() external payable {
        revert DoNotSendEthDirectlyHere();
    }

    /// @inheritdoc IGatewayEth2Deposit
    function enableEip7251() external {
        address eip7251Enabler = _feeManagerFactory.owner();
        if (msg.sender != eip7251Enabler) {
            revert CallerNotEip7251Enabler(msg.sender, eip7251Enabler);
        }

        _eip7251Enabled = true;

        emit Eip7251Enabled();
    }

    /// @inheritdoc IGatewayEth2Deposit
    function addEth(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _referenceFeeManager,
        address _sender,
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig,
        bytes calldata _extraData
    ) external payable returns (bytes32 depositId, address feeManagerInstance) {
        if (msg.value < MIN_DEPOSIT) {
            revert NoSmallDeposits();
        }
        if (
            (_ethAmountPerValidatorInWei != MIN_ACTIVATION_BALANCE ||
                _eth2WithdrawalCredentials[0] != 0x01) && !_eip7251Enabled
        ) {
            revert Eip7251NotEnabledYet();
        }
        if (
            _eth2WithdrawalCredentials[0] != 0x01 &&
            _eth2WithdrawalCredentials[0] != 0x02
        ) {
            revert IncorrectWithdrawalCredentialsPrefix(
                _eth2WithdrawalCredentials[0]
            );
        }
        if ((_eth2WithdrawalCredentials << 16) >> 176 != 0) {
            revert WithdrawalCredentialsBytesNotZero(
                _eth2WithdrawalCredentials
            );
        }
        if (
            _ethAmountPerValidatorInWei < MIN_ACTIVATION_BALANCE ||
            _ethAmountPerValidatorInWei > MAX_EFFECTIVE_BALANCE
        ) {
            revert EthAmountPerValidatorInWeiOutOfRange(
                _ethAmountPerValidatorInWei
            );
        }
        if (
            !ERC165Checker.supportsInterface(
                _referenceFeeManager,
                type(IFeeManager).interfaceId
            )
        ) {
            revert NotFeeManager(_referenceFeeManager);
        }

        feeManagerInstance = _feeManagerFactory.predictFeeManagerAddress(
            _referenceFeeManager,
            _clientConfig,
            _referrerConfig
        );

        depositId = getDepositId(
            _eth2WithdrawalCredentials,
            _ethAmountPerValidatorInWei,
            feeManagerInstance
        );

        if (
            _deposits[depositId].status == ClientDepositStatus.ServiceRejected
        ) {
            revert ShouldNotBeRejected(depositId);
        }

        if (feeManagerInstance.code.length == 0) {
            // if feeManagerInstance doesn't exist, deploy it

            _feeManagerFactory.createFeeManager(
                _referenceFeeManager,
                _clientConfig,
                _referrerConfig
            );
        }

        // amount = previous amount + new deposit
        uint112 amount = uint112(_deposits[depositId].amount + msg.value);

        // reset expiration starting from the current block.timestamp
        uint40 expiration = uint40(block.timestamp + TIMEOUT);

        _deposits[depositId] = ClientDeposit({
            ethDepositOperator: _sender,
            amount: amount,
            expiration: expiration,
            status: ClientDepositStatus.EthAdded,
            ethAmountPerValidatorInWei: _ethAmountPerValidatorInWei
        });

        emit ClientEthAdded(
            depositId,
            msg.sender,
            feeManagerInstance,
            _eth2WithdrawalCredentials,
            amount,
            expiration,
            _ethAmountPerValidatorInWei,
            _extraData
        );
    }

    /// @inheritdoc IGatewayEth2Deposit
    function rejectService(
        bytes32 _depositId,
        string calldata _reason
    ) external {
        _feeManagerFactory.checkOperatorOrOwner(msg.sender);

        if (_deposits[_depositId].status == ClientDepositStatus.None) {
            revert NoDepositToReject(_depositId);
        }

        _deposits[_depositId].status = ClientDepositStatus.ServiceRejected;
        _deposits[_depositId].expiration = 0; // allow the client to get a refund immediately

        emit ServiceRejected(_depositId, _reason);
    }

    /// @inheritdoc IGatewayEth2Deposit
    function refund(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _feeManagerInstance
    ) public {
        bytes32 depositId = getDepositId(
            _eth2WithdrawalCredentials,
            _ethAmountPerValidatorInWei,
            _feeManagerInstance
        );

        address client = IFeeManager(_feeManagerInstance).client();
        address operator = _ssvProxyFactory.operator();
        address ethDepositOperator = _deposits[depositId].ethDepositOperator;

        if (
            msg.sender != client &&
            msg.sender != operator &&
            msg.sender != ethDepositOperator
        ) {
            revert CallerNotClient(msg.sender, client);
        }

        uint40 expiration = _deposits[depositId].expiration;
        if (uint40(block.timestamp) < expiration) {
            revert WaitForExpiration(expiration, uint40(block.timestamp));
        }

        uint256 amount = _deposits[depositId].amount;
        if (amount == 0) {
            revert InsufficientBalance(depositId);
        }

        delete _deposits[depositId];

        bool success = AddressLib._sendValue(payable(client), amount);
        if (!success) {
            revert FailedToSendEth(client, amount);
        }

        emit Refund(depositId, _feeManagerInstance, client, amount);
    }

    /// @inheritdoc IGatewayEth2Deposit
    function makeBeaconDeposit(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _feeManagerInstance,
        bytes[] calldata _pubkeys,
        bytes[] calldata _signatures,
        bytes32[] calldata _depositDataRoots
    ) external {
        _feeManagerFactory.checkOperatorOrOwner(msg.sender);

        bytes32 depositId = getDepositId(
            _eth2WithdrawalCredentials,
            _ethAmountPerValidatorInWei,
            _feeManagerInstance
        );
        ClientDeposit memory clientDeposit = _deposits[depositId];

        if (clientDeposit.status == ClientDepositStatus.ServiceRejected) {
            revert ShouldNotBeRejected(depositId);
        }

        uint256 validatorCount = _pubkeys.length;
        uint112 amountToStake = uint112(
            _ethAmountPerValidatorInWei * validatorCount
        );

        if (validatorCount == 0 || validatorCount > VALIDATORS_MAX_AMOUNT) {
            revert ValidatorCountError();
        }

        if (clientDeposit.amount < amountToStake) {
            revert EtherValueError();
        }

        if (
            !(_signatures.length == validatorCount &&
                _depositDataRoots.length == validatorCount)
        ) {
            revert AmountOfParametersError();
        }

        uint112 newAmount = clientDeposit.amount - amountToStake;
        _deposits[depositId].amount = newAmount;
        if (newAmount == 0) {
            // all ETH has been deposited to Beacon DepositContract
            delete _deposits[depositId];
            emit Eth2DepositCompleted(depositId);
        } else {
            _deposits[depositId].status = ClientDepositStatus
                .BeaconDepositInProgress;
            emit Eth2DepositInProgress(depositId);
        }

        bytes memory withdrawalCredentials = new bytes(32);
        assembly ("memory-safe") {
            mstore(add(withdrawalCredentials, 32), _eth2WithdrawalCredentials)
        }

        for (uint256 i = 0; i < validatorCount; ) {
            // pubkey, withdrawal_credentials, signature lengths are already checked inside Beacon DepositContract

            _depositContract.deposit{value: _ethAmountPerValidatorInWei}(
                _pubkeys[i],
                withdrawalCredentials,
                _signatures[i],
                _depositDataRoots[i]
            );

            // An array can't have a total length
            // larger than the max uint256 value.
            unchecked {
                ++i;
            }
        }

        emit Eth2Deposit(depositId, validatorCount);
    }

    /// @inheritdoc IGatewayEth2Deposit
    function totalBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @inheritdoc IGatewayEth2Deposit
    function getDepositId(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _feeManagerInstance
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _eth2WithdrawalCredentials,
                    _ethAmountPerValidatorInWei,
                    _feeManagerInstance
                )
            );
    }

    /// @inheritdoc IGatewayEth2Deposit
    function getDepositId(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        address _referenceFeeManager,
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) public view returns (bytes32) {
        address feeManagerInstance = _feeManagerFactory
            .predictFeeManagerAddress(
                _referenceFeeManager,
                _clientConfig,
                _referrerConfig
            );

        return
            getDepositId(
                _eth2WithdrawalCredentials,
                _ethAmountPerValidatorInWei,
                feeManagerInstance
            );
    }

    /// @inheritdoc IGatewayEth2Deposit
    function depositAmount(bytes32 _depositId) external view returns (uint112) {
        return _deposits[_depositId].amount;
    }

    /// @inheritdoc IGatewayEth2Deposit
    function depositExpiration(
        bytes32 _depositId
    ) external view returns (uint40) {
        return _deposits[_depositId].expiration;
    }

    /// @inheritdoc IGatewayEth2Deposit
    function depositStatus(
        bytes32 _depositId
    ) external view returns (ClientDepositStatus) {
        return _deposits[_depositId].status;
    }

    function depositData(
        bytes32 _depositId
    ) external view returns (ClientDeposit memory) {
        return _deposits[_depositId];
    }

    /// @notice Returns whether EIP-7251 has been enabled
    function eip7251Enabled() external view returns (bool) {
        return _eip7251Enabled;
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IGatewayEth2Deposit).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function setSSVProxyFactory(address ssvProxyFactory_) external onlyOwner {
        _ssvProxyFactory = ISSVProxyFactory(ssvProxyFactory_);
    }

    function getSSVProxyFactory() external view returns (ISSVProxyFactory) {
        return _ssvProxyFactory;
    }

    function getDepositContract() external view returns (IDepositContract) {
        return _depositContract;
    }

    function getFeeManagerFactory() external view returns (IFeeManagerFactory) {
        return _feeManagerFactory;
    }
}
