// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "./BaseOwnable.sol";

/**
 * @dev OpenZeppelin's Ownable with modifier onlyOwner extracted to BaseOwnable
 */
abstract contract Ownable is BaseOwnable {
    /**
     * @dev Emits when the owner has been changed.
     * @param _previousOwner address of the previous owner
     * @param _newOwner address of the new owner
     */
    event OwnershipTransferred(
        address indexed _previousOwner,
        address indexed _newOwner
    );

    address private _owner;

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor() {
        _transferOwnership(_msgSender());
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual override returns (address) {
        return _owner;
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     * @param _newOwner address of the new owner
     */
    function transferOwnership(address _newOwner) external virtual onlyOwner {
        if (_newOwner == address(0)) {
            revert NewOwnerIsZeroAddress();
        }
        _transferOwnership(_newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     * @param _newOwner address of the new owner
     */
    function _transferOwnership(address _newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = _newOwner;
        emit OwnershipTransferred(oldOwner, _newOwner);
    }
}
