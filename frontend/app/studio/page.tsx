import type { Metadata } from "next";
import StudioClient from "../../components/studio/StudioClient";

export const metadata: Metadata = { title: "AIRO Studio | Xonangizni jihozlang", description: "AIRO Studio orqali karobka xonaga mebellarni qo‘shib ko‘ring." };

export default function StudioPage() { return <StudioClient />; }
