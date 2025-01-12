// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "./IOwnable.sol";

/**
 * @dev Ownable with an additional role of operator
 */
interface IOwnableWithOperator is IOwnable {
    /**
     * @notice newOperator is the zero address
     */
    error ZeroNewOperator();

    /**
     * @notice newOperator is the same as the old one
     */
    error SameOperator(address _operator);

    /**
     * @notice caller is neither the operator nor owner
     */
    error CallerNeitherOperatorNorOwner(
        address _caller,
        address _operator,
        address _owner
    );

    /**
     * @notice address is neither the operator nor owner
     */
    error AddressNeitherOperatorNorOwner(
        address _address,
        address _operator,
        address _owner
    );

    /**
     * @dev Returns the current operator.
     */
    function operator() external view returns (address);
}
