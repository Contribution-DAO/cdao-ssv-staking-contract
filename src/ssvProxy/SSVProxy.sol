// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

import "../access/OwnableWithOperator.sol";
import "../assetRecover/OwnableAssetRecover.sol";
import "../constants/StakingConstants.sol";
import "../interfaces/ssv-network/ISSVNetwork.sol";
import "../interfaces/ssvProxy/ISSVProxy.sol";
import "../interfaces/IDepositContract.sol";
import "../interfaces/feeManager/IFeeManagerFactory.sol";
import "../libraries/DepositStruct.sol";

/// @title Proxy for SSVNetwork calls.
/// @dev Each instance of SSVProxy corresponds to 1 FeeManager instance.
/// Thus, client to SSVProxy instances is a 1-to-many relation.
/// SSV tokens are managed by Operator.
/// Clients cover the costs of SSV tokens by EL rewards via FeeManager instance.
contract SSVProxy is OwnableAssetRecover, ERC165, ISSVProxy {
    /// @notice SSVProxyFactory address
    ISSVProxyFactory private immutable _ssvProxyFactory;

    /// @notice SSVNetwork address
    ISSVNetwork private immutable _ssvNetwork;

    /// @notice SSV token (ERC-20) address
    IERC20 private immutable _ssvToken;

    /// @notice FeeManager instance address
    IFeeManager private _feeManager;

    /// @notice If caller is not client, revert
    modifier onlyClient() {
        address clientAddress = getClient();

        if (clientAddress != msg.sender) {
            revert CallerNotClient(msg.sender, clientAddress);
        }
        _;
    }

    /// @notice If caller is neither operator nor owner, revert
    modifier onlyOperatorOrOwner() {
        address currentOwner = owner();
        address currentOperator = operator();

        if (currentOperator != msg.sender && currentOwner != msg.sender) {
            revert CallerNeitherOperatorNorOwner(
                msg.sender,
                currentOperator,
                currentOwner
            );
        }

        _;
    }

    /// @notice If caller is neither operator nor owner nor client, revert
    modifier onlyOperatorOrOwnerOrClient() {
        address operator_ = operator();
        address owner_ = owner();
        address client_ = getClient();

        if (
            operator_ != msg.sender &&
            owner_ != msg.sender &&
            client_ != msg.sender
        ) {
            revert CallerNeitherOperatorNorOwnerNorClient(msg.sender);
        }
        _;
    }

    /// @notice If caller is not factory, revert
    modifier onlySSVProxyFactory() {
        if (msg.sender != address(_ssvProxyFactory)) {
            revert NotSSVProxyFactoryCalled(msg.sender, _ssvProxyFactory);
        }
        _;
    }

    /// @dev Set values that are constant, common for all clients, known at the initial deploy time.
    /// @param ssvProxyFactory_ address of SSVProxyFactory
    /// @param ssvNetwork_ address of SSV Network
    /// @param ssvToken_ address of SSV Token
    constructor(
        address ssvProxyFactory_,
        address ssvNetwork_,
        address ssvToken_
    ) {
        if (
            !ERC165Checker.supportsInterface(
                ssvProxyFactory_,
                type(ISSVProxyFactory).interfaceId
            )
        ) {
            revert NotSSVProxyFactory(ssvProxyFactory_);
        }

        _ssvProxyFactory = ISSVProxyFactory(ssvProxyFactory_);
        _ssvNetwork = ISSVNetwork(ssvNetwork_);
        _ssvToken = IERC20(ssvToken_);
    }

    /// @inheritdoc ISSVProxy
    function initialize(address feeManager_) external onlySSVProxyFactory {
        _feeManager = IFeeManager(feeManager_);

        _ssvToken.approve(address(_ssvNetwork), type(uint256).max);

        emit Initialized(feeManager_);
    }

    /// @dev Access any SSVNetwork function as cluster owner (this SSVProxy instance)
    /// Each selector access is managed by SSVProxyFactory roles (owner, operator, client)
    fallback() external {
        address caller = msg.sender;
        bytes4 selector = msg.sig;

        bool isAllowed = msg.sender == owner() ||
            (msg.sender == operator() &&
                _ssvProxyFactory.isOperatorSelectorAllowed(selector)) ||
            (msg.sender == getClient() &&
                _ssvProxyFactory.isClientSelectorAllowed(selector));

        if (!isAllowed) {
            revert SelectorNotAllowed(caller, selector);
        }

        (bool success, bytes memory data) = address(_ssvNetwork).call(msg.data);
        if (success) {
            emit SuccessfullyCalledViaFallback(caller, selector);

            assembly ("memory-safe") {
                return(add(data, 0x20), mload(data))
            }
        } else {
            // Decode the reason from the error data returned from the call and revert with it.
            revert(string(data));
        }
    }

    /// @inheritdoc ISSVProxy
    function callAnyContract(
        address _contract,
        bytes calldata _calldata
    ) external onlyOwner {
        (bool success, bytes memory data) = address(_contract).call(_calldata);
        if (success) {
            emit SuccessfullyCalledExternalContract(
                _contract,
                bytes4(_calldata)
            );

            assembly ("memory-safe") {
                return(add(data, 0x20), mload(data))
            }
        } else {
            // Decode the reason from the error data returned from the call and revert with it.
            revert(string(data));
        }
    }

    /// @inheritdoc ISSVProxy
    function bulkRegisterValidators(
        bytes[] calldata publicKeys,
        uint64[] calldata operatorIds,
        bytes[] calldata sharesData,
        uint256 amount,
        ISSVNetwork.Cluster calldata cluster
    ) external onlySSVProxyFactory {
        _ssvNetwork.bulkRegisterValidator(
            publicKeys,
            operatorIds,
            sharesData,
            amount,
            cluster
        );
        _ssvNetwork.setFeeRecipientAddress(address(_feeManager));
    }

    /// @inheritdoc ISSVProxy
    function depositToSSV(
        uint256 _tokenAmount,
        uint64[] calldata _operatorIds,
        ISSVNetwork.Cluster[] calldata _clusters
    ) external {
        address clusterOwner = address(this);
        uint256 validatorCount = _clusters.length;
        uint256 tokenPerValidator = _tokenAmount / validatorCount;

        for (uint256 i = 0; i < validatorCount; ++i) {
            _ssvNetwork.deposit(
                clusterOwner,
                _operatorIds,
                tokenPerValidator,
                _clusters[i]
            );
        }
    }

    /// @inheritdoc ISSVProxy
    function withdrawFromSSV(
        uint256 _tokenAmount,
        uint64[] calldata _operatorIds,
        ISSVNetwork.Cluster[] calldata _clusters
    ) public onlyOperatorOrOwner {
        uint256 tokenPerValidator = _tokenAmount / _clusters.length;
        uint256 validatorCount = _clusters.length;

        for (uint256 i = 0; i < validatorCount; ++i) {
            _ssvNetwork.withdraw(_operatorIds, tokenPerValidator, _clusters[i]);
        }
    }

    /// @inheritdoc ISSVProxy
    function withdrawSSVTokens(
        address _to,
        uint256 _amount
    ) external onlyOwner {
        _ssvToken.transfer(_to, _amount);
    }

    /// @inheritdoc ISSVProxy
    function withdrawAllSSVTokensToFactory() public onlyOperatorOrOwner {
        uint256 balance = _ssvToken.balanceOf(address(this));
        _ssvToken.transfer(address(_ssvProxyFactory), balance);
    }

    function withdrawFromSSVToFactory(
        uint256 _tokenAmount,
        uint64[] calldata _operatorIds,
        ISSVNetwork.Cluster[] calldata _clusters
    ) external {
        withdrawFromSSV(_tokenAmount, _operatorIds, _clusters);
        withdrawAllSSVTokensToFactory();
    }

    /// @inheritdoc ISSVProxy
    function setFeeRecipientAddress(
        address _feeRecipientAddress
    ) external onlyOperatorOrOwner {
        _ssvNetwork.setFeeRecipientAddress(_feeRecipientAddress);
    }

    /// @notice Fires the exit event for a set of validators
    /// @param publicKeys The public keys of the validators to be exited
    /// @param operatorIds Array of IDs of operators managing the validators
    function bulkExitValidator(
        bytes[] calldata publicKeys,
        uint64[] calldata operatorIds
    ) external onlyOperatorOrOwnerOrClient {
        _ssvNetwork.bulkExitValidator(publicKeys, operatorIds);
    }

    /// @notice Extract operatorIds and clusterIndex out of SsvOperator list
    /// @param _ssvOperators list of SSV operator data
    /// @return operatorIds list of SSV operator IDs, clusterIndex updated cluster index
    function _getOperatorIdsAndClusterIndex(
        SsvOperator[] calldata _ssvOperators
    ) private view returns (uint64[] memory operatorIds, uint64 clusterIndex) {
        // clusterIndex updating logic reflects
        // https://github.com/bloxapp/ssv-network/blob/fe3b9b178344dd723b19792d01ab5010dfd2dcf9/contracts/modules/SSVClusters.sol#L77

        clusterIndex = 0;
        uint256 operatorCount = _ssvOperators.length;
        operatorIds = new uint64[](operatorCount);
        for (uint256 i = 0; i < operatorCount; ++i) {
            operatorIds[i] = _ssvOperators[i].id;

            uint256 snapshot = uint256(_ssvOperators[i].snapshot);

            // see https://github.com/bloxapp/ssv-network/blob/6ae5903a5c99c8d75b59fc0d35574d87f82e5861/contracts/libraries/OperatorLib.sol#L13
            clusterIndex +=
                uint64(snapshot >> 32) +
                (uint32(block.number) - uint32(snapshot)) *
                uint64(_ssvOperators[i].fee / 10_000_000);
        }
    }

    /// @notice Calculate the balance for the subsequent cluster values in a batch
    /// @param _cluster cluster value before the 1st validator registration
    /// @param _newIndex clusterIndex value after the 1st validator registration
    /// @param _currentNetworkFeeIndex currentNetworkFeeIndex from ssvSlot0
    /// @param _tokenAmount amount of SSV tokens deposited along with the 1st validator registration
    /// @return balance updated balance after the 1st validator registration
    function _getBalance(
        ISSVNetwork.Cluster calldata _cluster,
        uint64 _newIndex,
        uint64 _currentNetworkFeeIndex,
        uint256 _tokenAmount
    ) private pure returns (uint256 balance) {
        uint256 balanceBefore = _cluster.balance + _tokenAmount;

        // see https://github.com/bloxapp/ssv-network/blob/1e61c35736578d4b03bacbff9da2128ad12a5620/contracts/libraries/ClusterLib.sol#L16
        uint64 networkFee = uint64(
            _currentNetworkFeeIndex - _cluster.networkFeeIndex
        ) * _cluster.validatorCount;
        uint64 usage = (_newIndex - _cluster.index) *
            _cluster.validatorCount +
            networkFee;
        uint256 expandedUsage = uint256(usage) * 10_000_000;
        balance = expandedUsage > balanceBefore
            ? 0
            : balanceBefore - expandedUsage;
    }

    /// @notice Register subsequent validators after the 1st one
    /// @param i validator index in calldata
    /// @param _operatorIds list of SSV operator IDs
    /// @param _cluster cluster value before the 1st registration
    /// @param _clusterIndex calculated clusterIndex after the 1st registration
    /// @param _pubkey validator pubkey
    /// @param _sharesData validator SSV sharesData
    /// @param _currentNetworkFeeIndex currentNetworkFeeIndex from ssvSlot0
    /// @param _balance cluster balance after the 1st validator registration
    function _registerValidator(
        uint256 i,
        uint64[] memory _operatorIds,
        ISSVNetwork.Cluster calldata _cluster,
        uint64 _clusterIndex,
        bytes calldata _pubkey,
        bytes calldata _sharesData,
        uint64 _currentNetworkFeeIndex,
        uint256 _balance
    ) private {
        ISSVNetworkCore.Cluster memory cluster = ISSVNetworkCore.Cluster({
            validatorCount: uint32(_cluster.validatorCount + i),
            networkFeeIndex: _currentNetworkFeeIndex,
            index: _clusterIndex,
            active: true,
            balance: _balance
        });

        _ssvNetwork.registerValidator(
            _pubkey,
            _operatorIds,
            _sharesData,
            0,
            cluster
        );
    }

    /// @inheritdoc ISSVProxy
    function getClient() public view returns (address) {
        return _feeManager.client();
    }

    /// @inheritdoc ISSVProxy
    function getFactory() external view returns (address) {
        return address(_ssvProxyFactory);
    }

    /// @inheritdoc IOwnable
    function owner()
        public
        view
        override(BaseOwnable, IOwnable)
        returns (address)
    {
        return _ssvProxyFactory.owner();
    }

    /// @inheritdoc IOwnableWithOperator
    function operator() public view returns (address) {
        return _ssvProxyFactory.operator();
    }

    /// @inheritdoc ISSVProxy
    function getFeeManager() external view returns (address) {
        return address(_feeManager);
    }

    /// @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(ISSVProxy).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
