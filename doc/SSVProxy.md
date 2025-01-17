# SSVProxy Contract Documentation

## Overview

The SSVProxy contract acts as a proxy for SSVNetwork operations. Each SSVProxy instance corresponds to a single FeeManager instance, creating a one-to-many relationship between clients and SSVProxy instances. The contract manages SSV tokens on behalf of operators while clients cover costs through EL rewards via their FeeManager instance.

## Key Features

- Manages SSV Network interactions
- Handles validator registration
- Controls SSV token operations
- Provides access control for different roles
- Supports asset recovery

## Contract Inheritance

- OwnableAssetRecover
- ERC165
- ISSVProxy

## State Variables

- `_ssvProxyFactory`: Immutable SSVProxyFactory reference
- `_ssvNetwork`: Immutable SSVNetwork contract reference
- `_ssvToken`: Immutable SSV token (ERC-20) reference
- `_feeManager`: FeeManager instance reference

## Key Functions

### Constructor

```solidity
constructor(
    address ssvProxyFactory_,
    address ssvNetwork_,
    address ssvToken_
)
```

Initializes the proxy with factory, network, and token addresses.

### initialize

```solidity
function initialize(address feeManager_) external
```

Sets up the FeeManager instance and approves SSV token spending.

### bulkRegisterValidators

```solidity
function bulkRegisterValidators(
    bytes[] calldata publicKeys,
    uint64[] calldata operatorIds,
    bytes[] calldata sharesData,
    uint256 amount,
    ISSVNetwork.Cluster calldata cluster
) external
```

Registers multiple validators with the SSV network.

### depositToSSV

```solidity
function depositToSSV(
    uint256 _tokenAmount,
    uint64[] calldata _operatorIds,
    ISSVNetwork.Cluster[] calldata _clusters
) external
```

Deposits SSV tokens for validator operations.

## Access Control Modifiers

- `onlyClient`: Restricts access to the associated client
- `onlyOperatorOrOwner`: Limits access to operator or owner
- `onlyOperatorOrOwnerOrClient`: Allows access to operator, owner, or client
- `onlySSVProxyFactory`: Restricts access to the factory contract

## Events

- `Initialized`
- `SuccessfullyCalledViaFallback`
- `SuccessfullyCalledExternalContract`

## Integration Points

- Interacts with SSVNetwork for validator operations
- Works with FeeManager for cost management
- Connects with SSVProxyFactory for deployment and management

## Security Considerations

- Implements role-based access control
- Uses immutable addresses for critical contracts
- Validates contract interfaces using ERC165
- Supports asset recovery through OwnableAssetRecover
- Implements fallback function with selector validation
