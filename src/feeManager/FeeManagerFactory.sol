// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "../interfaces/feeManager/IFeeManagerFactory.sol";
import "../interfaces/feeManager/IFeeManager.sol";
import "../interfaces/gatewayEth2Deposit/IGatewayEth2Deposit.sol";
import "../libraries/DepositStruct.sol";
import "../access/Ownable.sol";
import "../access/OwnableWithOperator.sol";
import "../assetRecover/OwnableAssetRecover.sol";
import "../interfaces/ssvProxy/ISSVProxyFactory.sol";

/// @title Factory for cloning (EIP-1167) FeeManager instances pre client
contract FeeManagerFactory is
    OwnableAssetRecover,
    OwnableWithOperator,
    ERC165,
    IFeeManagerFactory
{
    /// @notice Default Client Basis Points
    /// @dev Used when no client config provided.
    /// Default Referrer Basis Points is zero.
    uint96 private _defaultClientBasisPoints;

    /// @notice The address of GatewayEth2Deposit
    address public _gatewayEth2Deposit;

    /// @notice client address -> array of client FeeManagers mapping
    mapping(address => address[]) private _allClientFeeManagers;

    /// @notice array of all FeeManagers for all clients
    address[] private _allFeeManagers;

    /// @notice SSVProxyFactory address
    ISSVProxyFactory internal _ssvProxyFactory;

    /// @dev Set values known at the initial deploy time.
    /// @param defaultClientBasisPoints_ Default Client Basis Points
    constructor(uint96 defaultClientBasisPoints_) {
        if (defaultClientBasisPoints_ >= 10000) {
            revert InvalidDefaultClientBasisPoints(defaultClientBasisPoints_);
        }

        _defaultClientBasisPoints = defaultClientBasisPoints_;

        emit DefaultClientBasisPointsSet(defaultClientBasisPoints_);
    }

    /// @notice Set a new version of GatewayEth2Deposit contract
    /// @param gatewayEth2Deposit_ the address of the new GatewayEth2Deposit contract
    function setGatewayEth2Deposit(
        address gatewayEth2Deposit_
    ) external onlyOwner {
        if (
            !ERC165Checker.supportsInterface(
                gatewayEth2Deposit_,
                type(IGatewayEth2Deposit).interfaceId
            )
        ) {
            revert NotGatewayEth2Deposit(gatewayEth2Deposit_);
        }

        _gatewayEth2Deposit = gatewayEth2Deposit_;
        emit GatewayEth2DepositSet(gatewayEth2Deposit_);
    }

    /// @notice Set a new Default Client Basis Points
    /// @param defaultClientBasisPoints_ Default Client Basis Points
    function setDefaultClientBasisPoints(
        uint96 defaultClientBasisPoints_
    ) external onlyOwner {
        if (defaultClientBasisPoints_ >= 10000) {
            revert InvalidDefaultClientBasisPoints(defaultClientBasisPoints_);
        }

        _defaultClientBasisPoints = defaultClientBasisPoints_;

        emit DefaultClientBasisPointsSet(defaultClientBasisPoints_);
    }

    /// @inheritdoc IFeeManagerFactory
    function createFeeManager(
        address _referenceFeeManager,
        FeeRecipient memory _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) external returns (address newFeeManagerAddress) {
        checkOperatorOrOwnerOrGatewayEth2Deposit(msg.sender);

        if (_referenceFeeManager == address(0)) {
            revert ReferenceFeeManagerNotSet();
        }

        if (
            !ERC165Checker.supportsInterface(
                _referenceFeeManager,
                type(IFeeManager).interfaceId
            )
        ) {
            revert NotFeeManager(_referenceFeeManager);
        }

        if (_clientConfig.basisPoints == 0) {
            _clientConfig.basisPoints = _defaultClientBasisPoints;
        }

        // clone the reference implementation of FeeManager
        newFeeManagerAddress = Clones.cloneDeterministic(
            _referenceFeeManager,
            _getSalt(_clientConfig, _referrerConfig)
        );

        // cast address to FeeManager
        IFeeManager newFeeManager = IFeeManager(newFeeManagerAddress);

        // set the client address to the cloned FeeManager instance
        newFeeManager.initialize(
            _clientConfig,
            _referrerConfig,
            address(_ssvProxyFactory)
        );

        // append new FeeManager address to all client feeManagers array
        _allClientFeeManagers[_clientConfig.recipient].push(
            newFeeManagerAddress
        );

        // append new FeeManager address to all feeManagers array
        _allFeeManagers.push(newFeeManagerAddress);

        // emit event with the address of the newly created instance for the external listener
        emit FeeManagerCreated(
            newFeeManagerAddress,
            _clientConfig.recipient,
            _referenceFeeManager,
            _clientConfig.basisPoints
        );

        return newFeeManagerAddress;
    }

    /// @inheritdoc IFeeManagerFactory
    function predictFeeManagerAddress(
        address _referenceFeeManager,
        FeeRecipient memory _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) public view returns (address) {
        if (_clientConfig.basisPoints == 0) {
            _clientConfig.basisPoints = _defaultClientBasisPoints;
        }

        return
            Clones.predictDeterministicAddress(
                _referenceFeeManager,
                _getSalt(_clientConfig, _referrerConfig)
            );
    }

    /// @inheritdoc IFeeManagerFactory
    function allClientFeeManagers(
        address _client
    ) external view returns (address[] memory) {
        return _allClientFeeManagers[_client];
    }

    /// @inheritdoc IFeeManagerFactory
    function allFeeManagers() external view returns (address[] memory) {
        return _allFeeManagers;
    }

    /// @inheritdoc IFeeManagerFactory
    function gatewayEth2Deposit() external view returns (address) {
        return _gatewayEth2Deposit;
    }

    /// @inheritdoc IFeeManagerFactory
    function defaultClientBasisPoints() external view returns (uint96) {
        return _defaultClientBasisPoints;
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IFeeManagerFactory).interfaceId ||
            super.supportsInterface(interfaceId);
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

    /// @inheritdoc IFeeManagerFactory
    function operator()
        public
        view
        override(OwnableWithOperator, IFeeManagerFactory)
        returns (address)
    {
        return super.operator();
    }

    /// @inheritdoc IFeeManagerFactory
    function checkOperatorOrOwner(
        address _address
    ) public view override(OwnableWithOperator, IFeeManagerFactory) {
        return super.checkOperatorOrOwner(_address);
    }

    /// @inheritdoc IFeeManagerFactory
    function checkGatewayEth2Deposit(address _address) external view {
        if (_gatewayEth2Deposit != _address) {
            revert NotGatewayEth2Deposit(_address);
        }
    }

    /// @inheritdoc IFeeManagerFactory
    function checkOperatorOrOwnerOrGatewayEth2Deposit(
        address _address
    ) public view {
        address currentOwner = owner();
        address currentOperator = operator();

        if (
            currentOperator != _address &&
            currentOwner != _address &&
            _gatewayEth2Deposit != _address
        ) {
            revert CallerNotAuthorized(_address);
        }
    }

    /// @notice Calculates the salt required for deterministic clone creation
    /// depending on clientConfig and referrerConfig
    /// @param _clientConfig address and basis points (percent * 100) of the client
    /// @param _referrerConfig address and basis points (percent * 100) of the referrer.
    /// @return bytes32 salt
    function _getSalt(
        FeeRecipient memory _clientConfig,
        FeeRecipient calldata _referrerConfig
    ) private pure returns (bytes32) {
        return keccak256(abi.encode(_clientConfig, _referrerConfig));
    }

    function setSSVProxyFactory(address ssvProxyFactory_) external onlyOwner {
        _ssvProxyFactory = ISSVProxyFactory(ssvProxyFactory_);
    }
}
