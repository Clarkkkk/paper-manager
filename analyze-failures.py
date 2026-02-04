# 分析模型失败模式
working = [
    ('LFM 2.5 1.2B', 'liquid', '1.2B', 'both'),
    ('DeepSeek R1', 'deepseek', 'unknown', 'notes'),
    ('DeepSeek R1T', 'tng', 'unknown', 'both'),
    ('DeepSeek R1T2', 'tng', 'unknown', 'both'),
    ('Trinity Mini', 'arcee', 'small', 'both'),
    ('Trinity Large', 'arcee', 'large', 'both'),
    ('Nemotron Nano', 'nvidia', '9B', 'both'),
    ('Nemotron VL', 'nvidia', '12B', 'both'),
    ('Nemotron 30B', 'nvidia', '30B', 'both'),
    ('Step 3.5', 'stepfun', 'unknown', 'both'),
    ('Solar Pro 3', 'upstage', 'unknown', 'both'),
    ('LFM Thinking', 'liquid', '1.2B', 'both'),
    ('Molmo 2 8B', 'allenai', '8B', 'both'),
    ('GLM 4.5 air', 'z-ai', 'unknown', 'both'),
    ('Free router', 'openrouter', 'auto', 'both'),
]

failing = [
    ('Llama 3.2 3B', 'meta', '3B', 'both'),
    ('Gemma 3 4B', 'google', '4B', 'both'),
    ('Gemma 3 12B', 'google', '12B', 'both'),
    ('Llama 3.1 405B', 'meta', '405B', 'both'),
    ('Llama 3.3 70B', 'meta', '70B', 'both'),
    ('Mistral Small 3.1', 'mistral', '24B', 'both'),
    ('Gemma 3 27B', 'google', '27B', 'both'),
    ('Venice Uncensored', 'cognitive', '24B', 'both'),
    ('Qwen3 Next 80B', 'qwen', '80B', 'both'),
    ('Qwen3 Coder', 'qwen', 'unknown', 'both'),
    ('Qwen3 VL', 'qwen', 'unknown', 'both'),
    ('GPT-OSS 120B', 'openai', '120B', 'both'),
    ('GPT-OSS 20B', 'openai', '20B', 'both'),
    ('Gemma 3n 2B', 'google', '2B', 'both'),
    ('Gemma 3n 4B', 'google', '4B', 'both'),
    ('Hermes 3 405B', 'nous', '405B', 'both'),
    ('Qwen3 4B', 'qwen', '4B', 'both'),
]

print("=" * 60)
print("模型失败分析报告")
print("=" * 60)

print("\n【按提供商分析】")
from collections import Counter
working_providers = Counter([p[1] for p in working])
failing_providers = Counter([p[1] for p in failing])

all_providers = set(list(working_providers.keys()) + list(failing_providers.keys()))
for provider in sorted(all_providers):
    w = working_providers.get(provider, 0)
    f = failing_providers.get(provider, 0)
    total = w + f
    success_rate = w / total * 100 if total > 0 else 0
    status = "✅" if success_rate > 50 else "❌"
    print(f"{status} {provider.upper().ljust(15)}: {w}/{total} 成功 ({success_rate:.0f}%)")

print("\n【失败模型的共同特征】")
print("Meta (Llama) 模型: 5个全部失败 - 100% 失败率")
print("Google (Gemma) 模型: 6个全部失败 - 100% 失败率")
print("Qwen 模型: 4个全部失败 - 100% 失败率")
print("大型模型 (>100B): GPT-OSS 120B, Llama 405B, Hermes 405B 全部失败")

print("\n【成功模型的共同特征】")
print("NVIDIA (Nemotron) 模型: 3个全部成功 - 100% 成功率")
print("Arcee (Trinity) 模型: 2个全部成功 - 100% 成功率")
print("Liquid (LFM) 模型: 2个全部成功 - 100% 成功率")
print("TNG (DeepSeek R1T/R1T2) 模型: 2个全部成功 - 100% 成功率")

print("\n【推荐可用模型列表】")
for name, provider, size, _ in working:
    print(f"  ✅ {name.ljust(20)} ({provider})")
