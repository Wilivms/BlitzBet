// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title CasinoHub
/// @notice Central bankroll, chip ledger, randomness source and leaderboard for BlitzBet.
/// @dev Players in BlitzBet do not own wallets. Every table action is submitted by the
///      house relayer (an operator) on behalf of a `playerId` handed out when a spectator
///      scans the table QR code. The hub is therefore custodial by design: it is an
///      on-chain ledger for an off-chain seating system, not a trustless casino.
contract CasinoHub {
    // ---------------------------------------------------------------- roles --
    address public owner;
    mapping(address => bool) public isOperator;
    mapping(address => bool) public isGame;

    // --------------------------------------------------------------- ledger --
    /// @notice House funds available to pay out wins and stake new players.
    uint256 public bankroll;
    /// @notice Chips currently sitting in front of a seat.
    mapping(bytes32 => uint256) public chips;
    /// @notice Lifetime profit/loss of a seat, in wei. Drives the leaderboard.
    mapping(bytes32 => int256) public netPnl;
    mapping(bytes32 => uint64) public betCount;
    mapping(bytes32 => string) public nickname;
    mapping(bytes32 => bool) public isPlayer;
    bytes32[] public players;

    // ---------------------------------------------------------- randomness --
    uint256 private _drawNonce;
    /// @notice Per-salt draw counter. Two draws never share a seed, even in one block.
    mapping(bytes32 => uint256) public drawNonce;

    // ------------------------------------------------------------- events ----
    event Funded(address indexed from, uint256 amount, uint256 bankroll);
    event Withdrawn(address indexed to, uint256 amount, uint256 bankroll);
    event PlayerJoined(bytes32 indexed playerId, string nickname, uint256 buyIn, uint256 chips);
    event Settled(
        bytes32 indexed playerId, address indexed game, uint256 wager, uint256 payout, uint256 chips, int256 netPnl
    );
    event GameSet(address indexed game, bool enabled);
    event OperatorSet(address indexed operator, bool enabled);

    error NotOwner();
    error NotOperator();
    error NotGame();
    error InsufficientChips();
    error InsufficientBankroll();
    error UnknownPlayer();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert NotOperator();
        _;
    }

    modifier onlyGame() {
        if (!isGame[msg.sender]) revert NotGame();
        _;
    }

    constructor() payable {
        owner = msg.sender;
        isOperator[msg.sender] = true;
        bankroll = msg.value;
        emit OperatorSet(msg.sender, true);
        if (msg.value > 0) emit Funded(msg.sender, msg.value, msg.value);
    }

    // ------------------------------------------------------------ bankroll --

    receive() external payable {
        bankroll += msg.value;
        emit Funded(msg.sender, msg.value, bankroll);
    }

    function fund() external payable {
        bankroll += msg.value;
        emit Funded(msg.sender, msg.value, bankroll);
    }

    function withdraw(uint256 amount) external onlyOwner {
        if (amount > bankroll) revert InsufficientBankroll();
        unchecked {
            bankroll -= amount;
        }
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount, bankroll);
    }

    // --------------------------------------------------------------- admin --

    function setGame(address game, bool enabled) external onlyOwner {
        isGame[game] = enabled;
        emit GameSet(game, enabled);
    }

    function setOperator(address op, bool enabled) external onlyOwner {
        isOperator[op] = enabled;
        emit OperatorSet(op, enabled);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // -------------------------------------------------------------- seating --

    /// @notice Seat a spectator and stake them from the bankroll.
    /// @param playerId Opaque seat id, derived off-chain from the QR session.
    /// @param nick     Display name for the leaderboard. Empty string keeps the old one.
    /// @param buyIn    Chips handed to the seat, taken out of the bankroll.
    function join(bytes32 playerId, string calldata nick, uint256 buyIn) external onlyOperator {
        if (!isPlayer[playerId]) {
            isPlayer[playerId] = true;
            players.push(playerId);
        }
        if (bytes(nick).length != 0) nickname[playerId] = nick;
        if (buyIn > 0) {
            if (buyIn > bankroll) revert InsufficientBankroll();
            unchecked {
                bankroll -= buyIn;
            }
            chips[playerId] += buyIn;
        }
        emit PlayerJoined(playerId, nickname[playerId], buyIn, chips[playerId]);
    }

    /// @notice Return a seat's chips to the bankroll (player cashes out / leaves the table).
    function cashOut(bytes32 playerId) external onlyOperator returns (uint256 returned) {
        returned = chips[playerId];
        if (returned > 0) {
            chips[playerId] = 0;
            bankroll += returned;
        }
    }

    // ------------------------------------------------------------ settlement --

    /// @notice Move value between a seat and the bankroll. Called only by registered games.
    /// @param wager  Chips taken from the seat (the stake). 0 when only paying out.
    /// @param payout Chips handed to the seat. 0 when only taking a stake.
    function settle(bytes32 playerId, uint256 wager, uint256 payout) external onlyGame {
        if (!isPlayer[playerId]) revert UnknownPlayer();
        if (wager > 0) {
            if (chips[playerId] < wager) revert InsufficientChips();
            unchecked {
                chips[playerId] -= wager;
                betCount[playerId] += 1;
            }
            bankroll += wager;
        }
        if (payout > 0) {
            if (bankroll < payout) revert InsufficientBankroll();
            unchecked {
                bankroll -= payout;
            }
            chips[playerId] += payout;
        }
        netPnl[playerId] += int256(payout) - int256(wager);
        emit Settled(playerId, msg.sender, wager, payout, chips[playerId], netPnl[playerId]);
    }

    // ------------------------------------------------------------ randomness --

    /// @notice Pseudo-random word for a registered game.
    /// @dev NOT cryptographically secure and NOT safe for real money. The house relayer is
    ///      the only sender and a Monad validator could bias `blockhash`. What this *does*
    ///      guarantee is that a bet cannot be replayed into a better outcome: every call
    ///      bumps both a per-salt counter and a global counter, so two draws never share a
    ///      seed even inside a single block. `block.timestamp` is deliberately not load
    ///      bearing here: Monad blocks are 300ms but TIMESTAMP is second-granularity, so
    ///      3-4 consecutive blocks carry the same value.
    function draw(bytes32 salt) external onlyGame returns (uint256) {
        uint256 global_;
        uint256 local_;
        unchecked {
            global_ = ++_drawNonce;
            local_ = ++drawNonce[salt];
        }
        return uint256(
            keccak256(
                abi.encodePacked(
                    blockhash(block.number - 1), block.prevrandao, block.number, msg.sender, salt, local_, global_
                )
            )
        );
    }

    // ------------------------------------------------------------ leaderboard --

    function playerCount() external view returns (uint256) {
        return players.length;
    }

    function leaderboard()
        external
        view
        returns (
            bytes32[] memory ids,
            string[] memory nicks,
            uint256[] memory chipBalances,
            int256[] memory pnl,
            uint64[] memory bets
        )
    {
        uint256 n = players.length;
        ids = new bytes32[](n);
        nicks = new string[](n);
        chipBalances = new uint256[](n);
        pnl = new int256[](n);
        bets = new uint64[](n);
        for (uint256 i; i < n; ++i) {
            bytes32 p = players[i];
            ids[i] = p;
            nicks[i] = nickname[p];
            chipBalances[i] = chips[p];
            pnl[i] = netPnl[p];
            bets[i] = betCount[p];
        }
    }
}
