// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../../libraries/DepositStruct.sol";

/// @dev External interface of FeeManager declared to support ERC165 detection.
interface IFeeManager is IERC165 {
    /// @notice Emits once the client and the optional referrer have been set.
    /// @param _client address of the client.
    /// @param _clientBasisPoints basis points (percent * 100) of EL rewards that should go to the client
    /// @param _referrer address of the referrer.
    /// @param _referrerBasisPoints basis points (percent * 100) of EL rewards that should go to the referrer
    /// @param _ssvProxyFactory address of the SSVProxyFactory
    event Initialized(
        address indexed _client,
        uint96 _clientBasisPoints,
        address indexed _referrer,
        uint96 _referrerBasisPoints,
        address _ssvProxyFactory
    );

    /// @notice Emits on successful withdrawal
    /// @param _serviceAmount how much wei service received
    /// @param _clientAmount how much wei client received
    /// @param _referrerAmount how much wei referrer received
    event Withdrawn(
        uint256 _serviceAmount,
        uint256 _clientAmount,
        uint256 _referrerAmount
    );

    /// @notice Should be a FeeManagerFactory contract
    /// @param _passedAddress passed address that does not support IFeeManagerFactory interface
    error NotFactory(address _passedAddress);

    /// @notice Service address should be a secure address, not zero.
    error ZeroAddressService();

    /// @notice Client address should be different from service address.
    /// @param _passedAddress passed client address that equals to the service address
    error ClientAddressEqualsService(address _passedAddress);

    /// @notice Client address should be an actual client address, not zero.
    error ZeroAddressClient();

    /// @notice Client basis points should be >= 0 and <= 10000
    /// @param _clientBasisPoints passed incorrect client basis points
    error InvalidClientBasisPoints(uint96 _clientBasisPoints);

    /// @notice Referrer basis points should be > 0 if the referrer exists
    error ZeroReferrerBasisPointsForNonZeroReferrer();

    /// @notice The sum of (Client basis points + Referral basis points) should be >= 0 and <= 10000
    /// @param _clientBasisPoints passed client basis points
    /// @param _referralBasisPoints passed referral basis points
    error ClientPlusReferralBasisPointsExceed10000(
        uint96 _clientBasisPoints,
        uint96 _referralBasisPoints
    );

    /// @notice Referrer address should be different from service address.
    /// @param _passedAddress passed referrer address that equals to the service address
    error ReferrerAddressEqualsService(address _passedAddress);

    /// @notice Referrer address should be different from client address.
    /// @param _passedAddress passed referrer address that equals to the client address
    error ReferrerAddressEqualsClient(address _passedAddress);

    /// @notice Only factory can call `initialize`.
    /// @param _msgSender sender address.
    /// @param _actualFactory the actual factory address that can call `initialize`.
    error NotFactoryCalled(address _msgSender, address _actualFactory);

    /// @notice `initialize` should only be called once.
    /// @param _existingClient address of the client with which the contact has already been initialized.
    error ClientAlreadySet(address _existingClient);

    /// @notice Cannot call `withdraw` if the client address is not set yet.
    /// @dev The client address is supposed to be set by the factory.
    error ClientNotSet();

    /// @notice basisPoints of the referrer must be zero if referrer address is empty.
    /// @param _referrerBasisPoints basisPoints of the referrer.
    error ReferrerBasisPointsMustBeZeroIfAddressIsZero(
        uint96 _referrerBasisPoints
    );

    /// @notice service should be able to receive ether.
    /// @param _service address of the service.
    error ServiceCannotReceiveEther(address _service);

    /// @notice client should be able to receive ether.
    /// @param _client address of the client.
    error ClientCannotReceiveEther(address _client);

    /// @notice referrer should be able to receive ether.
    /// @param _referrer address of the referrer.
    error ReferrerCannotReceiveEther(address _referrer);

    /// @notice zero ether balance
    error NothingToWithdraw();

    /// @notice Throws if called by any account other than the client.
    /// @param _caller address of the caller
    /// @param _client address of the client
    error CallerNotClient(address _caller, address _client);

    /// @notice Throws in case there was some ether left after `withdraw` and it has failed to recover.
    /// @param _to destination address for ether.
    /// @param _amount how much wei the destination address should have received, but didn't.
    error EtherRecoveryFailed(address _to, uint256 _amount);

    /// @notice ETH receiver should not be a zero address
    error ZeroAddressEthReceiver();

    /// @notice Set client address.
    /// @dev Could not be in the constructor since it is different for different clients.
    /// _referrerConfig can be zero if there is no referrer.
    /// @param _clientConfig address and basis points (percent * 100) of the client
    /// @param _referrerConfig address and basis points (percent * 100) of the referrer.
    /// @param _ssvProxyFactory address of the SSVProxyFactory
    function initialize(
        FeeRecipient calldata _clientConfig,
        FeeRecipient calldata _referrerConfig,
        address _ssvProxyFactory
    ) external;

    /// @notice Returns the factory address
    /// @return address factory address
    function factory() external view returns (address);

    /// @notice Returns the service address
    /// @return address service address
    function service() external view returns (address);

    /// @notice Returns the client address
    /// @return address client address
    function client() external view returns (address);

    /// @notice Returns the client basis points
    /// @return uint256 client basis points
    function clientBasisPoints() external view returns (uint256);

    /// @notice Returns the referrer address
    /// @return address referrer address
    function referrer() external view returns (address);

    /// @notice Returns the referrer basis points
    /// @return uint256 referrer basis points
    function referrerBasisPoints() external view returns (uint256);
}
