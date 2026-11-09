import { permanentRedirect } from "next/navigation";

export default function LegacyHeistPreviewPage() {
  permanentRedirect("/heist/arena");
}
