import { permanentRedirect } from "next/navigation";

export default function LegacyReplayPage() {
  permanentRedirect("/heist/replay");
}
