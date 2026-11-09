import { permanentRedirect } from "next/navigation";

export default function LegacyArenaPage() {
  permanentRedirect("/heist/arena");
}
