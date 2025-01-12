// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "../interfaces/feeManager/IFeeManagerFactory.sol";
import "../assetRecover/OwnableTokenRecover.sol";
import "../access/OwnableWithOperator.sol";
import "../libraries/DepositStruct.sol";
import "../libraries/AddressLib.sol";
import "../erc4337/ERC4337Account.sol";
import "../interfaces/ssvProxy/ISSVProxyFactory.sol";

/// @title Common logic for all FeeManager types
abstract contract FeeManager is
    ERC4337Account,
    OwnableTokenRecover,
    OwnableWithOperator,
    ReentrancyGuard,
    ERC165,
    IFeeManager
{
    /// @notice FeeManagerFactory address
    IFeeManagerFactory internal immutable _factory;

    /// @notice fee recipient address
    address payable internal immutable _service;

    /// @notice Client rewards recipient address and basis points
    FeeRecipient internal _clientConfig;

    /// @notice Referrer rewards recipient address and basis points
    FeeRecipient internal _referrerConfig;

    /// @notice SSVProxyFactory address
    ISSVProxyFactory internal _ssvProxyFactory;

    /// @notice If caller not client, revert
    modifier onlyClient() {
        address clientAddress = _clientConfig.recipient;

        if (clientAddress != msg.sender) {
            revert CallerNotClient(msg.sender, clientAddress);
        }
        _;
    }

    /// @notice If caller not factory, revert
    modifier onlyFactory() {
        if (msg.sender != address(_factory)) {
            revert NotFactoryCalled(msg.sender, address(_factory));
        }
        _;
    }

    /// @dev Set values that are constant, common for all the clients, known at the initial deploy time.
    /// @param factory_ address of FeeManagerFactory
    /// @param service_ address of the service fee recipient
    constructor(address factory_, address payable service_) {
        if (
            !ERC165Checker.supportsInterface(
                factory_,
                type(IFeeManagerFactory).interfaceId
            )
        ) {
            revert NotFactory(factory_);
        }
        if (service_ == address(0)) {
            revert ZeroAddressService();
        }

        _factory = IFeeManagerFactory(factory_);
        _service = service_;

        bool serviceCanReceiveEther = AddressLib._sendValue(service_, 0);
        if (!serviceCanReceiveEther) {
            revert ServiceCannotReceiveEther(service_);
        }
    }

    /// @inheritdoc IFeeManager
    function initialize(
        FeeRecipient calldata clientConfig_,
        FeeRecipient calldata referrerConfig_,
        address ssvProxyFactory_
    ) public virtual onlyFactory {
        _ssvProxyFactory = ISSVProxyFactory(ssvProxyFactory_);
        if (clientConfig_.recipient == address(0)) {
            revert ZeroAddressClient();
        }
        if (clientConfig_.recipient == _service) {
            revert ClientAddressEqualsService(clientConfig_.recipient);
        }
        if (_clientConfig.recipient != address(0)) {
            revert ClientAlreadySet(_clientConfig.recipient);
        }
        if (clientConfig_.basisPoints >= 10000) {
            revert InvalidClientBasisPoints(clientConfig_.basisPoints);
        }

        if (referrerConfig_.recipient != address(0)) {
            // if there is a referrer
            if (referrerConfig_.recipient == _service) {
                revert ReferrerAddressEqualsService(referrerConfig_.recipient);
            }
            if (referrerConfig_.recipient == clientConfig_.recipient) {
                revert ReferrerAddressEqualsClient(referrerConfig_.recipient);
            }
            if (referrerConfig_.basisPoints == 0) {
                revert ZeroReferrerBasisPointsForNonZeroReferrer();
            }
            if (
                clientConfig_.basisPoints + referrerConfig_.basisPoints > 10000
            ) {
                revert ClientPlusReferralBasisPointsExceed10000(
                    clientConfig_.basisPoints,
                    referrerConfig_.basisPoints
                );
            }

            // set referrer config
            _referrerConfig = referrerConfig_;
        } else {
            // if there is no referrer
            if (referrerConfig_.basisPoints != 0) {
                revert ReferrerBasisPointsMustBeZeroIfAddressIsZero(
                    referrerConfig_.basisPoints
                );
            }
        }

        // set client config
        _clientConfig = clientConfig_;

        emit Initialized(
            clientConfig_.recipient,
            clientConfig_.basisPoints,
            referrerConfig_.recipient,
            referrerConfig_.basisPoints,
            ssvProxyFactory_
        );

        bool clientCanReceiveEther = AddressLib._sendValue(
            clientConfig_.recipient,
            0
        );
        if (!clientCanReceiveEther) {
            revert ClientCannotReceiveEther(clientConfig_.recipient);
        }
        if (referrerConfig_.recipient != address(0)) {
            // if there is a referrer
            bool referrerCanReceiveEther = AddressLib._sendValue(
                referrerConfig_.recipient,
                0
            );
            if (!referrerCanReceiveEther) {
                revert ReferrerCannotReceiveEther(referrerConfig_.recipient);
            }
        }
    }

    /// @notice Accept ether from transactions
    receive() external payable {
        // only accept ether in an instance, not in a template
        if (_clientConfig.recipient == address(0)) {
            revert ClientNotSet();
        }
    }

    /// @inheritdoc IFeeManager
    function factory() external view returns (address) {
        return address(_factory);
    }

    /// @inheritdoc IFeeManager
    function service() external view returns (address) {
        return _service;
    }

    /// @inheritdoc IFeeManager
    function client()
        public
        view
        override(ERC4337Account, IFeeManager)
        returns (address)
    {
        return _clientConfig.recipient;
    }

    /// @inheritdoc IFeeManager
    function clientBasisPoints() external view returns (uint256) {
        return _clientConfig.basisPoints;
    }

    /// @inheritdoc IFeeManager
    function referrer() external view returns (address) {
        return _referrerConfig.recipient;
    }

    /// @inheritdoc IFeeManager
    function referrerBasisPoints() external view returns (uint256) {
        return _referrerConfig.basisPoints;
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IFeeManager).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IOwnable
    function owner()
        public
        view
        override(ERC4337Account, BaseOwnable, Ownable, IOwnable)
        returns (address)
    {
        return _factory.owner();
    }

    /// @inheritdoc IOwnableWithOperator
    function operator()
        public
        view
        override(ERC4337Account, OwnableWithOperator)
        returns (address)
    {
        return super.operator();
    }

    function getSSVProxyFactory() external view returns (address) {
        return address(_ssvProxyFactory);
    }
}
