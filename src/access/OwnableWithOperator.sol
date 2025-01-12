// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "../access/Ownable.sol";
import "../interfaces/access/IOwnableWithOperator.sol";

/**
 * @dev Ownable with an additional role of operator
 */
abstract contract OwnableWithOperator is Ownable, IOwnableWithOperator {
    address private _operator;

    /**
     * @dev Emits when the operator has been changed
     * @param _previousOperator address of the previous operator
     * @param _newOperator address of the new operator
     */
    event OperatorChanged(
        address indexed _previousOperator,
        address indexed _newOperator
    );

    /**
     * @dev Throws if called by any account other than the operator or the owner.
     */
    modifier onlyOperatorOrOwner() {
        address currentOwner = owner();
        address currentOperator = _operator;

        if (currentOperator != _msgSender() && currentOwner != _msgSender()) {
            revert CallerNeitherOperatorNorOwner(
                _msgSender(),
                currentOperator,
                currentOwner
            );
        }

        _;
    }

    function checkOperatorOrOwner(address _address) public view virtual {
        address currentOwner = owner();
        address currentOperator = _operator;

        if (
            _address == address(0) ||
            (currentOperator != _address && currentOwner != _address)
        ) {
            revert AddressNeitherOperatorNorOwner(
                _address,
                currentOperator,
                currentOwner
            );
        }
    }

    /**
     * @dev Returns the current operator.
     */
    function operator() public view virtual returns (address) {
        return _operator;
    }

    /**
     * @dev Transfers operator to a new account (`newOperator`).
     * Can only be called by the current owner.
     */
    function changeOperator(address _newOperator) external virtual onlyOwner {
        if (_newOperator == address(0)) {
            revert ZeroNewOperator();
        }
        if (_newOperator == _operator) {
            revert SameOperator(_newOperator);
        }

        _changeOperator(_newOperator);
    }

    /**
     * @dev Transfers operator to a new account (`newOperator`).
     * Internal function without access restriction.
     */
    function _changeOperator(address _newOperator) internal virtual {
        address oldOperator = _operator;
        _operator = _newOperator;
        emit OperatorChanged(oldOperator, _newOperator);
    }

    /**
     * @dev Dismisses the old operator without setting a new one.
     * Can only be called by the current owner.
     */
    function dismissOperator() external virtual onlyOwner {
        _changeOperator(address(0));
    }
}
