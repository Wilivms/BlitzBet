import { Riviera } from "./Riviera";

const HOUSE = "0xcFe7934D31F6C22DDaFeD72FC065D13eFF48b368";
const PLAYERS = process.env.NEXT_PUBLIC_PLAYERS_WALLET ?? "0x828504d626ad39d271006467dc543976f3fb2dcd";

/** Une seule page : le salon 3D. Le même lien sert l'écran de table et les téléphones. */
export default function Home() {
  return <Riviera house={HOUSE} players={PLAYERS} />;
}
