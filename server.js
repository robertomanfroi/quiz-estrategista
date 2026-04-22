const express = require('express');
const path    = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app  = express();
const PORT = process.env.PORT || 3000;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ── Prompt do analista ─────────────────────────────────────────── */
const PROMPT_ANALYST = `Você é o Analista Estratégico da Engrene, criado por Suellen Warmling.
Sua função é gerar um diagnóstico personalizado e plano de ação com base nos dados do quiz respondido.

REGRA MÁXIMA: Só use os dados fornecidos. Nunca invente fatos, nunca extrapole além do que foi informado.

DADOS RECEBIDOS:
- Pontuação total: {PONTUACAO}/60 → Nível: {NIVEL}
- Nicho: {NICHO}
- Faturamento mensal: {FATURAMENTO}
- Investe em tráfego pago: {TRAFEGO}
- Canal principal de vendas: {CANAL}
- Respostas detalhadas: {RESPOSTAS}

ESTRUTURA DA RESPOSTA (use exatamente esses títulos em Markdown):

## 🧠 Seu Nível Estratégico: {NIVEL}

[Parágrafo de 3-4 linhas contextualizando o resultado para o nicho e faturamento específico. Direto, sem elogios genéricos.]

## 💡 Oportunidades Escondidas no Seu Cenário

[Com base no cruzamento nicho + faturamento + tráfego, liste 3-4 oportunidades reais e específicas. Não seja genérico. Mostre que existe dinheiro na mesa que está sendo deixado para trás.]

## 🎯 Plano de Ação — 5 Movimentos Estratégicos

[Entregue exatamente 5 ações diretas, numeradas. Cada uma com: nome da ação em negrito, 1-2 linhas de como executar, e estimativa de impacto financeiro realista para o nicho e faturamento informado.]

## 📱 Campanha Pronta para Essa Semana

[Uma campanha específica — nome, formato (Reel/Story/WhatsApp), gancho, CTA, e quando postar. Baseada no nicho real da pessoa.]

## 💬 Script de WhatsApp para Vender Hoje

[Um script pronto de 4-6 mensagens para prospecção ou reativação de clientes, adaptado ao nicho e canal principal informado.]

## 🚀 Próximo Nível

[1 parágrafo: o que separa a pessoa do nível seguinte. Termine com uma frase de impacto que crie desejo pelo método Engrene.]

REGRAS DE ESTILO:
- Fale diretamente com "você"
- Use linguagem direta, brasileira, sem enrolação
- Seja específico ao nicho — não fale "seu produto", fale "sua confeitaria" / "seu salão" etc.
- Inclua números e estimativas financeiras quando relevante
- Máximo 900 palavras no total`;

/* ── Endpoint principal ─────────────────────────────────────────── */
app.post('/api/resultado', async (req, res) => {
  const { pontuacao, nivel, nicho, faturamento, trafego, canal, respostas } = req.body;

  if (pontuacao === undefined || !nicho) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }

  const prompt = PROMPT_ANALYST
    .replace('{PONTUACAO}', pontuacao)
    .replace('{NIVEL}', nivel)
    .replace('{NICHO}', nicho || 'Não informado')
    .replace('{FATURAMENTO}', faturamento || 'Não informado')
    .replace('{TRAFEGO}', trafego || 'Não informado')
    .replace('{CANAL}', canal || 'Não informado')
    .replace('{RESPOSTAS}', JSON.stringify(respostas || {}));

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Erro Claude:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao gerar análise.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Erro ao gerar análise.' })}\n\n`);
      res.end();
    }
  }
});

/* ── Health check ───────────────────────────────────────────────── */
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

/* ── Self-ping Railway ──────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`Quiz Estrategista rodando na porta ${PORT}`);

  const SELF_URL = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${PORT}`;

  setInterval(async () => {
    try { await fetch(`${SELF_URL}/health`); } catch (_) {}
  }, 14 * 60 * 1000);
});
