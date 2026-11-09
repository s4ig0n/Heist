import { permanentRedirect } from "next/navigation";

export default function LegacyStreamTestPage() {
  permanentRedirect("/heist/arena");
}
