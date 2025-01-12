// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import {ISSVNetworkCore} from "./ISSVNetworkCore.sol";
import {ISSVOperators} from "./ISSVOperators.sol";
import {ISSVClusters} from "./ISSVClusters.sol";

/// @dev https://github.com/ssvlabs/ssv-network/blob/2e90a0cc44ae2645ea06ef9c0fcd2369bbf3c277/contracts/interfaces/ISSVNetwork.sol
interface ISSVNetwork is ISSVNetworkCore, ISSVOperators, ISSVClusters {
    function setFeeRecipientAddress(address feeRecipientAddress) external;
}
