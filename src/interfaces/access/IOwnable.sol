// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

/**
 * @dev External interface of Ownable.
 */
interface IOwnable {
    /**
     * @notice Throws if called by any account other than the owner.
     * @param _caller address of the caller
     * @param _owner address of the owner
     */
    error CallerNotOwner(address _caller, address _owner);

    /**
     * @notice _newOwner cannot be a zero address
     */
    error NewOwnerIsZeroAddress();

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() external view returns (address);
}
