// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "../assetRecover/OwnableTokenRecover.sol";
import "../libraries/DepositStruct.sol";
import "./FeeManager.sol";

/// @title FeeManager accepting and splitting EL rewards only.
contract RewardFeeManager is FeeManager {
    /// @dev Set values that are constant, common for all the clients, known at the initial deploy time.
    /// @param _factory address of FeeManagerFactory
    /// @param _service address of the service fee recipient
    constructor(
        address _factory,
        address payable _service
    ) FeeManager(_factory, _service) {}

    /// @notice Withdraw the whole balance of the contract according to the pre-defined basis points.
    /// @dev In case someone (either service, or client, or referrer) fails to accept ether,
    /// the owner will be able to recover some of their share.
    /// This scenario is very unlikely. It can only happen if that someone is a contract
    /// whose receive function changed its behavior since FeeManager's initialization.
    /// It can never happen unless the receiving party themselves wants it to happen.
    /// We strongly recommend against intentional reverts in the receive function
    /// because the remaining parties might call `withdraw` again multiple times without waiting
    /// for the owner to recover ether for the reverting party.
    /// In fact, as a punishment for the reverting party, before the recovering,
    /// 1 more regular `withdraw` will happen, rewarding the non-reverting parties again.
    /// `recoverEther` function is just an emergency backup plan and does not replace `withdraw`.
    function withdraw() external nonReentrant {
        address withdrawOperator = _ssvProxyFactory.operator();

        if (
            msg.sender != withdrawOperator &&
            msg.sender != _clientConfig.recipient
        ) {
            revert CallerNotClient(msg.sender, _clientConfig.recipient);
        }

        if (_clientConfig.recipient == address(0)) {
            revert ClientNotSet();
        }

        // get the contract's balance
        uint256 balance = address(this).balance;

        if (balance == 0) {
            // revert if there is no ether to withdraw
            revert NothingToWithdraw();
        }

        // how much should client get
        uint256 clientAmount = (balance * _clientConfig.basisPoints) / 10000;

        // how much should service get
        uint256 serviceAmount = balance - clientAmount;

        // how much should referrer get
        uint256 referrerAmount;

        if (_referrerConfig.recipient != address(0)) {
            // if there is a referrer

            referrerAmount = (balance * _referrerConfig.basisPoints) / 10000;
            serviceAmount -= referrerAmount;

            // Send ETH to referrer. Ignore the possible yet unlikely revert in the receive function.
            AddressLib._sendValue(_referrerConfig.recipient, referrerAmount);
        }

        // Send ETH to service. Ignore the possible yet unlikely revert in the receive function.
        AddressLib._sendValue(_service, serviceAmount);

        // Send ETH to client. Ignore the possible yet unlikely revert in the receive function.
        AddressLib._sendValue(_clientConfig.recipient, clientAmount);

        emit Withdrawn(serviceAmount, clientAmount, referrerAmount);
    }
}
