// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {CasinoHub} from "../src/CasinoHub.sol";
import {CoinFlip} from "../src/games/CoinFlip.sol";
import {Roulette} from "../src/games/Roulette.sol";
import {Blackjack} from "../src/games/Blackjack.sol";
import {Aviator} from "../src/games/Aviator.sol";

/// @notice Deploys the hub, the live games, and wires them together in one broadcast.
/// @dev BANKROLL_WEI seeds the house bankroll at construction. Keep it well clear of the
///      10 MON Monad reserve balance: the deployer is also the relayer, and an account that
///      dips under the reserve starts having transactions rejected mid-demo.
contract Deploy is Script {
    function run() external {
        uint256 bankroll = vm.envOr("BANKROLL_WEI", uint256(0));

        vm.startBroadcast();
        CasinoHub hub = new CasinoHub{value: bankroll}();
        CoinFlip coinflip = new CoinFlip(address(hub));
        Roulette roulette = new Roulette(address(hub));
        Blackjack blackjack = new Blackjack(address(hub));
        Aviator aviator = new Aviator(address(hub));
        hub.setGame(address(coinflip), true);
        hub.setGame(address(roulette), true);
        hub.setGame(address(blackjack), true);
        hub.setGame(address(aviator), true);
        vm.stopBroadcast();

        console.log("NEXT_PUBLIC_CASINO_HUB=%s", address(hub));
        console.log("NEXT_PUBLIC_COINFLIP=%s", address(coinflip));
        console.log("NEXT_PUBLIC_ROULETTE=%s", address(roulette));
        console.log("NEXT_PUBLIC_BLACKJACK=%s", address(blackjack));
        console.log("NEXT_PUBLIC_AVIATOR=%s", address(aviator));
        console.log("bankroll seeded (wei): %s", bankroll);
    }
}
