// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

import "../interfaces/IDepositContract.sol";
import "../interfaces/ssv-network/ISSVViews.sol";
import "../interfaces/feeManager/IFeeManagerFactory.sol";
import "../interfaces/feeManager/IFeeManager.sol";
import "../interfaces/gatewayEth2Deposit/IGatewayEth2Deposit.sol";
import "../interfaces/ssvProxy/ISSVProxyFactory.sol";

import "../assetRecover/OwnableAssetRecover.sol";
import "../access/OwnableWithOperator.sol";
import "../libraries/DepositStruct.sol";
import "./SSVProxy.sol";

/// @title Entry point for SSV validator registration
/// @dev Deploys SSVProxy instances
contract SSVProxyFactory is
    OwnableAssetRecover,
    OwnableWithOperator,
    ERC165,
    ISSVProxyFactory
{
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice SSVNetwork address
    ISSVNetwork public immutable _ssvNetwork;

    /// @notice Beacon Deposit Contract
    IDepositContract public immutable _depositContract;

    /// @notice GatewayEth2Deposit
    IGatewayEth2Deposit public immutable _gatewayEth2Deposit;

    /// @notice FeeManagerFactory
    IFeeManagerFactory private immutable _feeManagerFactory;

    /// @notice SSV ERC-20 token
    IERC20 public immutable _ssvToken;

    /// @notice SSVNetworkViews
    ISSVViews public immutable _ssvViews;

    /// @notice Template set by Owner to be used for new FeeManager instances.
    /// @dev Can be changed by Owner at any time. It will only affect the new clusters.
    /// Existing clusters will keep their existing FeeManager instance.
    address private _referenceFeeManager;

    /// @notice Template set by Owner to be used for new SSVProxy instances.
    /// @dev Can be changed by Owner at any time. It will only affect the new clusters.
    /// Existing clusters will keep their existing SSVProxy instance.
    SSVProxy private _referenceSSVProxy;

    /// @notice a set of addresses of SSV operator owners (both Owner and partners).
    /// @dev Only Owner can add or remove addresses from the set.
    EnumerableSet.AddressSet private _allowedSsvOperatorOwners;

    /// @notice a mapping of (client address → a list of addresses of the deployed client SSVProxy instances).
    /// @dev Updated automatically during SSVProxy instance deployment.
    mapping(address => address[]) private _allClientSsvProxies;

    /// @notice a mapping of (SSVProxy instance address → hasBeenDeployed flag).
    /// @dev Updated automatically during SSVProxy instance deployment.
    mapping(address => bool) private _deployedSsvProxies;

    /// @notice a list of all ever deployed client SSVProxy instances.
    /// @dev Updated automatically during SSVProxy instance deployment.
    address[] private _allSsvProxies;

    /// @notice a mapping to check if a certain selector (function signature) is allowed for clients to call on SSVNetwork via SSVProxy.
    mapping(bytes4 => bool) private _clientSelectors;

    /// @notice a mapping to check if a certain selector (function signature) is allowed for a operator to call on SSVNetwork via SSVProxy.
    mapping(bytes4 => bool) private _operatorSelectors;

    /// @notice Maximum amount of SSV tokens per validator that is allowed for client to deposit during `depositEthAndRegisterValidators`
    uint112 public _maxSsvTokenAmountPerValidator;

    /// @notice a mapping of (User address → AddEthData[])
    mapping(address => AddEthData[]) private _addEthData;

    /// @dev Set values that are constant, common for all clients, known at the initial deploy time.
    /// @param gatewayEth2Deposit_ GatewayEth2Deposit address
    /// @param feeManagerFactory_ FeeManagerFactory address
    /// @param referenceFeeManager_ reference FeeManager address
    /// @param depositContract_ native deposit contract
    /// @param ssvNetwork_ address of SSV Network
    /// @param ssvViews_ address of SSV Views
    /// @param ssvToken_ address of SSV Token
    constructor(
        address gatewayEth2Deposit_,
        address feeManagerFactory_,
        address referenceFeeManager_,
        address depositContract_,
        address ssvNetwork_,
        address ssvViews_,
        address ssvToken_
    ) {
        if (
            !ERC165Checker.supportsInterface(
                gatewayEth2Deposit_,
                type(IGatewayEth2Deposit).interfaceId
            )
        ) {
            revert NotGatewayEth2Deposit(gatewayEth2Deposit_);
        }
        _gatewayEth2Deposit = IGatewayEth2Deposit(gatewayEth2Deposit_);

        if (
            !ERC165Checker.supportsInterface(
                feeManagerFactory_,
                type(IFeeManagerFactory).interfaceId
            )
        ) {
            revert NotFeeManagerFactory(feeManagerFactory_);
        }
        _feeManagerFactory = IFeeManagerFactory(feeManagerFactory_);

        if (
            !ERC165Checker.supportsInterface(
                referenceFeeManager_,
                type(IFeeManager).interfaceId
            )
        ) {
            revert NotFeeManager(referenceFeeManager_);
        }

        _referenceFeeManager = referenceFeeManager_;
        emit ReferenceFeeManagerSet(referenceFeeManager_);

        _depositContract = IDepositContract(depositContract_);

        _ssvToken = IERC20(ssvToken_);

        _ssvViews = ISSVViews(ssvViews_);

        _ssvNetwork = ISSVNetwork(ssvNetwork_);

        _ssvToken.approve(address(_ssvNetwork), type(uint256).max);
    }

    /// @inheritdoc ISSVProxyFactory
    function setMaxSsvTokenAmountPerValidator(
        uint112 maxSsvTokenAmountPerValidator_
    ) external onlyOwner {
        if (
            maxSsvTokenAmountPerValidator_ < 10 ** 12 ||
            maxSsvTokenAmountPerValidator_ > 10 ** 24
        ) {
            revert MaxSsvTokenAmountPerValidatorOutOfRange();
        }

        _maxSsvTokenAmountPerValidator = maxSsvTokenAmountPerValidator_;
        emit MaxSsvTokenAmountPerValidatorSet(maxSsvTokenAmountPerValidator_);
    }

    /// @inheritdoc ISSVProxyFactory
    function setReferenceSSVProxy(
        address referenceSSVProxy_
    ) external onlyOwner {
        if (
            !ERC165Checker.supportsInterface(
                referenceSSVProxy_,
                type(ISSVProxy).interfaceId
            )
        ) {
            revert NotSSVProxy(referenceSSVProxy_);
        }

        _referenceSSVProxy = SSVProxy(referenceSSVProxy_);
        emit ReferenceSSVProxySet(referenceSSVProxy_);
    }

    /// @inheritdoc ISSVProxyFactory
    function setAllowedSelectorsForClient(
        bytes4[] calldata _selectors
    ) external onlyOwner {
        uint256 count = _selectors.length;

        if (count == 0) {
            revert CannotSetZeroSelectors();
        }

        for (uint256 i = 0; i < count; ++i) {
            _clientSelectors[_selectors[i]] = true;
        }

        emit AllowedSelectorsForClientSet(_selectors);
    }

    /// @inheritdoc ISSVProxyFactory
    function removeAllowedSelectorsForClient(
        bytes4[] calldata _selectors
    ) external onlyOwner {
        uint256 count = _selectors.length;

        if (count == 0) {
            revert CannotRemoveZeroSelectors();
        }

        for (uint256 i = 0; i < count; ++i) {
            _clientSelectors[_selectors[i]] = false;
        }

        emit AllowedSelectorsForClientRemoved(_selectors);
    }

    /// @inheritdoc ISSVProxyFactory
    function setAllowedSelectorsForOperator(
        bytes4[] calldata _selectors
    ) external onlyOwner {
        uint256 count = _selectors.length;

        if (count == 0) {
            revert CannotSetZeroSelectors();
        }

        for (uint256 i = 0; i < count; ++i) {
            _operatorSelectors[_selectors[i]] = true;
        }

        emit AllowedSelectorsForOperatorSet(_selectors);
    }

    /// @inheritdoc ISSVProxyFactory
    function removeAllowedSelectorsForOperator(
        bytes4[] calldata _selectors
    ) external onlyOwner {
        uint256 count = _selectors.length;

        if (count == 0) {
            revert CannotRemoveZeroSelectors();
        }

        for (uint256 i = 0; i < count; ++i) {
            _operatorSelectors[_selectors[i]] = false;
        }

        emit AllowedSelectorsForOperatorRemoved(_selectors);
    }

    /// @inheritdoc ISSVProxyFactory
    function setReferenceFeeManager(
        address referenceFeeManager_
    ) external onlyOperatorOrOwner {
        if (
            !ERC165Checker.supportsInterface(
                referenceFeeManager_,
                type(IFeeManager).interfaceId
            )
        ) {
            revert NotFeeManager(referenceFeeManager_);
        }

        _referenceFeeManager = referenceFeeManager_;
        emit ReferenceFeeManagerSet(referenceFeeManager_);
    }

    /// @inheritdoc ISSVProxyFactory
    function predictSSVProxyAddress(
        address _feeManagerInstance
    ) public view returns (address) {
        return
            Clones.predictDeterministicAddress(
                address(_referenceSSVProxy),
                bytes32(bytes20(_feeManagerInstance))
            );
    }

    /// @inheritdoc ISSVProxyFactory
    function predictSSVProxyAddress(
        address referenceFeeManager_,
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) external view returns (address) {
        address feeManagerInstance = _feeManagerFactory
            .predictFeeManagerAddress(
                referenceFeeManager_,
                _clientConfig,
                _referrerConfig
            );
        return predictSSVProxyAddress(feeManagerInstance);
    }

    /// @inheritdoc ISSVProxyFactory
    function predictSSVProxyAddress(
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) external view returns (address) {
        address feeManagerInstance = _feeManagerFactory
            .predictFeeManagerAddress(
                _referenceFeeManager,
                _clientConfig,
                _referrerConfig
            );
        return predictSSVProxyAddress(feeManagerInstance);
    }

    /// @inheritdoc ISSVProxyFactory
    function predictSSVProxyAddress(
        FeeRecipient calldata _clientConfig
    ) external view returns (address) {
        address feeManagerInstance = _feeManagerFactory
            .predictFeeManagerAddress(
                _referenceFeeManager,
                _clientConfig,
                FeeRecipient({recipient: payable(address(0)), basisPoints: 0})
            );
        return predictSSVProxyAddress(feeManagerInstance);
    }

    /// @inheritdoc ISSVProxyFactory
    function createSSVProxy(
        address _feeManagerInstance
    ) external onlyOperatorOrOwner returns (address ssvProxyInstance) {
        ssvProxyInstance = _createSSVProxy(_feeManagerInstance);
    }

    /// @inheritdoc ISSVProxyFactory
    function addEth(
        bytes32 _eth2WithdrawalCredentials,
        uint96 _ethAmountPerValidatorInWei,
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig,
        bytes calldata _extraData
    ) external payable returns (bytes32, address, address) {
        (bytes32 depositId, address feeManagerInstance) = _gatewayEth2Deposit
            .addEth{value: msg.value}(
            _eth2WithdrawalCredentials,
            _ethAmountPerValidatorInWei,
            _referenceFeeManager,
            msg.sender,
            _clientConfig,
            _referrerConfig,
            _extraData
        );

        address ssvProxy = _createSSVProxy(feeManagerInstance);

        _addEthData[_clientConfig.recipient].push(
            AddEthData({
                depositId: depositId,
                operator: msg.sender,
                feeManagerInstance: feeManagerInstance,
                ssvProxy: ssvProxy,
                ethAmount: msg.value,
                blockNumber: block.number
            })
        );

        emit EthForSsvStakingDeposited(
            depositId,
            msg.sender,
            ssvProxy,
            _eth2WithdrawalCredentials,
            _clientConfig.recipient,
            _referrerConfig.recipient,
            feeManagerInstance,
            msg.value
        );

        return (depositId, feeManagerInstance, ssvProxy);
    }

    /// @inheritdoc ISSVProxyFactory
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
    ) external onlyOperatorOrOwner returns (address ssvProxy) {
        ssvProxy = predictSSVProxyAddress(_feeManagerInstance);
        if (ssvProxy.code.length == 0) {
            revert SSVProxyDoesNotExist(_feeManagerInstance);
        }

        uint256 validatorCount = _publicKeys.length;
        _checkTokenAmount(_amount, validatorCount);

        // Lengths matching check for public keys, signatures, and deposit data roots
        // is done by GatewayEth2Deposit

        _gatewayEth2Deposit.makeBeaconDeposit(
            _eth2WithdrawalCredentials,
            _ethAmountPerValidatorInWei,
            _feeManagerInstance,
            _publicKeys,
            _depositData.signatures,
            _depositData.depositDataRoots
        );

        _ssvToken.transfer(address(ssvProxy), _amount);

        SSVProxy(ssvProxy).bulkRegisterValidators(
            _publicKeys,
            _operatorIds,
            _sharesData,
            _amount,
            _cluster
        );

        emit RegistrationCompleted(ssvProxy);
    }

    /// @inheritdoc ISSVProxyFactory
    function depositToSSV(
        address _clusterOwner,
        uint256 _tokenAmount,
        uint64[] calldata _operatorIds,
        ISSVNetwork.Cluster calldata _cluster
    ) external onlyOwner {
        _ssvNetwork.deposit(
            _clusterOwner,
            _operatorIds,
            _tokenAmount,
            _cluster
        );
    }

    function _checkTokenAmount(
        uint256 _tokenAmount,
        uint256 _validatorCount
    ) private view {
        uint112 maxSsvTokenAmountPerValidator = _maxSsvTokenAmountPerValidator;

        if (maxSsvTokenAmountPerValidator == 0) {
            revert MaxSsvTokenAmountPerValidatorNotSet();
        }

        if (_tokenAmount > maxSsvTokenAmountPerValidator * _validatorCount) {
            revert MaxSsvTokenAmountPerValidatorExceeded();
        }
    }

    /// @notice Deploy SSVProxy instance if not deployed before
    /// @param _feeManagerInstance The address of FeeManager instance
    /// @return ssvProxyInstance client SSVProxy instance that has been deployed
    function _createSSVProxy(
        address _feeManagerInstance
    ) private returns (address ssvProxyInstance) {
        ssvProxyInstance = predictSSVProxyAddress(_feeManagerInstance);
        if (ssvProxyInstance.code.length == 0) {
            // if ssvProxyInstance doesn't exist, deploy it
            if (
                !ERC165Checker.supportsInterface(
                    _feeManagerInstance,
                    type(IFeeManager).interfaceId
                )
            ) {
                revert NotFeeManager(_feeManagerInstance);
            }

            // clone the reference implementation of SSVProxy
            ssvProxyInstance = Clones.cloneDeterministic(
                address(_referenceSSVProxy),
                bytes32(bytes20(_feeManagerInstance))
            );

            // set the client address to the cloned SSVProxy instance
            SSVProxy(ssvProxyInstance).initialize(_feeManagerInstance);

            address client = IFeeManager(_feeManagerInstance).client();

            // append new SSVProxy address to all client SsvProxies array
            _allClientSsvProxies[client].push(ssvProxyInstance);

            // append new SSVProxy address to all SsvProxies array
            _allSsvProxies.push(ssvProxyInstance);

            _deployedSsvProxies[ssvProxyInstance] = true;

            // emit event with the address of the newly created instance for the external listener
            emit SSVProxyCreated(ssvProxyInstance, client, _feeManagerInstance);
        }
    }

    /// @notice Deploy FeeManager instance if not deployed before
    /// @param _clientConfig address and basis points (percent * 100) of the client (for FeeManager)
    /// @param _referrerConfig address and basis points (percent * 100) of the referrer (for FeeManager)
    /// @return feeManagerInstance client FeeManager instance that has been deployed
    function _createFeeManager(
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) private returns (address feeManagerInstance) {
        address referenceFeeManager_ = _referenceFeeManager;

        feeManagerInstance = _feeManagerFactory.predictFeeManagerAddress(
            referenceFeeManager_,
            _clientConfig,
            _referrerConfig
        );
        if (feeManagerInstance.code.length == 0) {
            // if feeManagerInstance doesn't exist, deploy it
            _feeManagerFactory.createFeeManager(
                referenceFeeManager_,
                _clientConfig,
                _referrerConfig
            );
        }
    }

    /// @inheritdoc IOwnable
    function owner()
        public
        view
        override(Ownable, BaseOwnable, IOwnable)
        returns (address)
    {
        return super.owner();
    }

    /// @inheritdoc ISSVProxyFactory
    function getFeeManagerFactory() external view returns (address) {
        return address(_feeManagerFactory);
    }

    /// @inheritdoc ISSVProxyFactory
    function getAllClientSsvProxies(
        address _client
    ) external view returns (address[] memory) {
        return _allClientSsvProxies[_client];
    }

    /// @inheritdoc ISSVProxyFactory
    function getAllSsvProxies() external view returns (address[] memory) {
        return _allSsvProxies;
    }

    /// @inheritdoc ISSVProxyFactory
    function isClientSelectorAllowed(
        bytes4 _selector
    ) external view returns (bool) {
        return _clientSelectors[_selector];
    }

    /// @inheritdoc ISSVProxyFactory
    function isOperatorSelectorAllowed(
        bytes4 _selector
    ) external view returns (bool) {
        return _operatorSelectors[_selector];
    }

    /// @inheritdoc ISSVProxyFactory
    function getAllowedSsvOperatorOwners()
        external
        view
        returns (address[] memory)
    {
        return _allowedSsvOperatorOwners.values();
    }

    /// @inheritdoc ISSVProxyFactory
    function getReferenceFeeManager() external view returns (address) {
        return _referenceFeeManager;
    }

    /// @inheritdoc ISSVProxyFactory
    function getReferenceSSVProxy() external view returns (address) {
        return address(_referenceSSVProxy);
    }

    /// @inheritdoc ISSVProxyFactory
    function getMaxSsvTokenAmountPerValidator()
        external
        view
        returns (uint112)
    {
        return _maxSsvTokenAmountPerValidator;
    }

    function getAddEthData(
        address _client
    ) external view returns (AddEthData[] memory) {
        return _addEthData[_client];
    }

    /// @inheritdoc ISSVWhitelistingContract
    function isWhitelisted(
        address account,
        uint256
    ) external view returns (bool) {
        return _deployedSsvProxies[account];
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(ISSVProxyFactory).interfaceId ||
            interfaceId == type(ISSVWhitelistingContract).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
