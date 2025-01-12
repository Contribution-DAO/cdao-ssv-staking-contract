// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/Context.sol";
import "../interfaces/access/IOwnable.sol";

/**
 * @dev minimalistic version of OpenZeppelin's Ownable.
 * The owner is abstract and is not persisted in storage.
 * Needs to be overridden in a child contract.
 */
abstract contract BaseOwnable is Context, IOwnable {
    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        address caller = _msgSender();
        address currentOwner = owner();

        if (currentOwner != caller) {
            revert CallerNotOwner(caller, currentOwner);
        }
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     * Needs to be overridden in a child contract.
     */
    function owner() public view virtual override returns (address);
}
