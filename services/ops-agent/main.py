import asyncio
import os
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import aws

load_dotenv()


class OpsAssistant(Agent):
    """OPS 어르신 케어 AI 어시스턴트"""

    def __init__(self):
        super().__init__(
            instructions="""
당신은 어르신들을 돌보는 친절한 AI 어시스턴트입니다.
- 항상 존댓말을 사용하세요
- 천천히, 명확하게 말씀해 주세요
- 어르신의 건강과 안부를 먼저 물어보세요
- 필요시 보호자에게 연락할 수 있도록 안내하세요
"""
        )


async def entrypoint(ctx: agents.JobContext):
    """LiveKit Agent 진입점"""
    await ctx.connect()

    session = AgentSession(
        stt=aws.STT(language="ko-KR"),
        llm=aws.LLM(model="anthropic.claude-haiku-4-5-v1:0"),
        tts=aws.TTS(voice="Seoyeon"),
    )

    await session.start(
        room=ctx.room,
        agent=OpsAssistant(),
        room_input_options=RoomInputOptions(
            noise_cancellation=True,
        ),
    )


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
        )
    )
