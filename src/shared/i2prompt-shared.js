(function (global) {
  'use strict';

  const VERSION = '0.1.1';

  const PROMPTS = {
    zh: [
      '请用中文回答。你是一名专业的 AI 绘画提示词分析师，请分析这张图片并只返回 JSON 对象，不要输出 Markdown、解释或额外文字。',
      '',
      'JSON 顶层必须包含两个字段：',
      '1. text_prompt：一段可直接用于 AI 绘画模型的完整中文提示词，包含主体、场景、风格、构图、色彩、光线、情绪和必要技术细节。',
      '2. json_prompt：结构化对象，必须包含 subject、scene、style、composition、color_tone、lighting、mood、technical、tags。',
      '',
      '要求：',
      '- 所有内容必须使用中文。',
      '- tags 是字符串数组。',
      '- 不要编造图片中不存在的品牌、水印或文字。',
      '- 如果图片信息不足，用合理但保守的视觉描述补全。',
      '',
      '返回格式示例：',
      '{"text_prompt":"...","json_prompt":{"subject":"...","scene":"...","style":"...","composition":"...","color_tone":"...","lighting":"...","mood":"...","technical":"...","tags":["..."]}}'
    ].join('\n'),
    en: [
      'Answer in English. You are a professional AI art prompt analyst. Analyze this image and return JSON only. Do not output Markdown, explanations, or extra text.',
      '',
      'The JSON object must contain two top-level fields:',
      '1. text_prompt: a complete English prompt that can be used directly in an AI image generation model, covering subject, scene, style, composition, color, lighting, mood, and useful technical details.',
      '2. json_prompt: a structured object with subject, scene, style, composition, color_tone, lighting, mood, technical, tags.',
      '',
      'Requirements:',
      '- All content must be in English.',
      '- tags must be an array of strings.',
      '- Do not invent brands, watermarks, or text that are not visible.',
      '- If visual information is limited, complete the description conservatively.',
      '',
      'Return example:',
      '{"text_prompt":"...","json_prompt":{"subject":"...","scene":"...","style":"...","composition":"...","color_tone":"...","lighting":"...","mood":"...","technical":"...","tags":["..."]}}'
    ].join('\n')
  };

  const PROVIDERS = {
    modelscope: {
      id: 'modelscope',
      label: 'ModelScope',
      apiBase: 'https://api-inference.modelscope.cn/v1',
      model: 'Qwen/Qwen3.5-397B-A17B',
      endpointMode: 'openai-chat',
      imageMode: 'url-first',
      supportsUrl: true,
      supportsBase64: false,
      quotaHeader: 'Modelscope-Ratelimit-Model-Requests-Remaining',
      modelsEndpointMode: 'openai-models',
      modelPresets: [
        'Qwen/Qwen3.5-397B-A17B',
        'MiniMax/MiniMax-M2.5',
        'moonshotai/Kimi-K2.5',
        'ZhipuAI/GLM-5',
        'MusePublic/Qwen-Image-Edit'
      ]
    },
    openai_chat: {
      id: 'openai_chat',
      label: 'OpenAI Chat',
      apiBase: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      endpointMode: 'openai-chat',
      modelsEndpointMode: 'openai-models',
      imageMode: 'auto',
      supportsUrl: true,
      supportsBase64: true,
      modelPresets: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini']
    },
    openai_responses: {
      id: 'openai_responses',
      label: 'OpenAI Responses',
      apiBase: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      endpointMode: 'openai-responses',
      modelsEndpointMode: 'openai-models',
      imageMode: 'auto',
      supportsUrl: true,
      supportsBase64: true,
      modelPresets: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o']
    },
    anthropic: {
      id: 'anthropic',
      label: 'Anthropic Claude',
      apiBase: 'https://api.anthropic.com/v1',
      model: 'claude-3-5-sonnet-latest',
      endpointMode: 'anthropic',
      modelsEndpointMode: 'openai-models',
      imageMode: 'auto',
      supportsUrl: true,
      supportsBase64: true,
      modelPresets: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest']
    },
    google_gemini: {
      id: 'google_gemini',
      label: 'Google Gemini',
      apiBase: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.5-flash',
      endpointMode: 'gemini',
      modelsEndpointMode: 'gemini-models',
      imageMode: 'base64',
      supportsUrl: false,
      supportsBase64: true,
      modelPresets: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
    },
    siliconflow: {
      id: 'siliconflow',
      label: '硅基流动',
      apiBase: 'https://api.siliconflow.cn/v1',
      model: 'Qwen/Qwen2.5-VL-72B-Instruct',
      endpointMode: 'openai-chat',
      modelsEndpointMode: 'openai-models',
      imageMode: 'auto',
      supportsUrl: true,
      supportsBase64: true,
      modelPresets: ['Qwen/Qwen2.5-VL-72B-Instruct', 'Qwen/Qwen2-VL-72B-Instruct', 'Pro/Qwen/Qwen2.5-VL-72B-Instruct']
    },
    openai_compatible: {
      id: 'openai_compatible',
      label: 'OpenAI 兼容',
      apiBase: 'https://api.example.com/v1',
      model: 'your-vision-model',
      endpointMode: 'openai-chat',
      modelsEndpointMode: 'openai-models',
      imageMode: 'auto',
      supportsUrl: true,
      supportsBase64: true,
      modelPresets: []
    }
  };

  const DEFAULT_SETTINGS = {
    activeConfigId: 'default-modelscope',
    defaultLanguage: 'zh',
    autoCopy: true,
    copyMode: 'text',
    historyLimit: 50,
    showQuota: true,
    screenshotEnabled: false,
    detail: 'high'
  };

  function makeDefaultConfig() {
    const provider = PROVIDERS.modelscope;
    return {
      id: 'default-modelscope',
      name: 'ModelScope Qwen',
      provider: provider.id,
      apiBase: provider.apiBase,
      apiKey: '',
      model: provider.model,
      imageMode: provider.imageMode,
      detail: 'high',
      maxTokens: 2048,
      temperature: 0.2,
      enableThinking: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function providerOf(config) {
    return PROVIDERS[config?.provider] || PROVIDERS.openai_compatible;
  }

  function normalizeApiBase(base) {
    return String(base || '').trim().replace(/\/+$/, '');
  }

  function joinUrl(base, path) {
    return normalizeApiBase(base) + '/' + String(path || '').replace(/^\/+/, '');
  }

  function promptFor(language) {
    return PROMPTS[language] || PROMPTS.zh;
  }

  function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || ''));
  }

  function isDataUrl(value) {
    return /^data:/i.test(String(value || ''));
  }

  function parseDataUrl(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)(;base64)?,(.*)$/);
    if (!match) return null;
    return {
      mimeType: match[1] || 'image/jpeg',
      base64: match[3] || '',
      dataUrl
    };
  }

  function imagePartForOpenAI(image, detail) {
    return {
      type: 'image_url',
      image_url: {
        url: image.dataUrl || image.url,
        detail: detail || 'high'
      }
    };
  }

  function imagePartForResponses(image, detail) {
    return {
      type: 'input_image',
      image_url: image.dataUrl || image.url,
      detail: detail || 'high'
    };
  }

  function imagePartForAnthropic(image) {
    if (image.dataUrl) {
      const parsed = parseDataUrl(image.dataUrl);
      if (!parsed) throw new Error('图片 base64 数据格式无效');
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: parsed.mimeType,
          data: parsed.base64
        }
      };
    }
    return {
      type: 'image',
      source: {
        type: 'url',
        url: image.url
      }
    };
  }

  function imagePartForGemini(image) {
    const parsed = parseDataUrl(image.dataUrl);
    if (!parsed) throw new Error('Gemini 需要 base64 图片数据');
    return {
      inline_data: {
        mime_type: parsed.mimeType,
        data: parsed.base64
      }
    };
  }

  function buildApiRequest(config, image, language) {
    const provider = providerOf(config);
    const apiBase = normalizeApiBase(config.apiBase || provider.apiBase);
    const model = config.model || provider.model;
    const prompt = config.systemPrompt || promptFor(language);
    const maxTokens = Number(config.maxTokens || 2048);
    const temperature = Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : 0.2;
    const detail = config.detail || 'high';
    const apiKey = String(config.apiKey || '').trim();

    if (!apiKey) throw new Error('请先在设置页填写 API Key');

    if (provider.endpointMode === 'gemini') {
      return {
        url: joinUrl(apiBase, `models/${encodeURIComponent(model)}:generateContent`),
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: {
          contents: [
            {
              role: 'user',
              parts: [
                imagePartForGemini(image),
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: maxTokens,
            temperature
          }
        },
        parser: 'gemini'
      };
    }

    if (provider.endpointMode === 'anthropic') {
      return {
        url: joinUrl(apiBase, 'messages'),
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: {
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            {
              role: 'user',
              content: [
                imagePartForAnthropic(image),
                { type: 'text', text: prompt }
              ]
            }
          ]
        },
        parser: 'anthropic'
      };
    }

    if (provider.endpointMode === 'openai-responses') {
      return {
        url: joinUrl(apiBase, 'responses'),
        headers: {
          'Content-Type': 'application/json',
          Authorization: bearer(apiKey)
        },
        body: {
          model,
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: prompt },
                imagePartForResponses(image, detail)
              ]
            }
          ],
          max_output_tokens: maxTokens,
          temperature
        },
        parser: 'openai-responses'
      };
    }

    const body = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            imagePartForOpenAI(image, detail),
            { type: 'text', text: prompt }
          ]
        }
      ],
      max_tokens: maxTokens,
      temperature
    };

    if (provider.id === 'modelscope') {
      body.enable_thinking = config.enableThinking === true;
    }

    return {
      url: joinUrl(apiBase, 'chat/completions'),
      headers: {
        'Content-Type': 'application/json',
        Authorization: bearer(apiKey)
      },
      body,
      parser: 'openai-chat'
    };
  }

  function buildModelsRequest(config) {
    const provider = providerOf(config);
    const apiBase = normalizeApiBase(config.apiBase || provider.apiBase);
    const apiKey = String(config.apiKey || '').trim();
    if (!apiKey) throw new Error('请先填写 API Key 后再获取模型列表');

    if (provider.modelsEndpointMode === 'gemini-models') {
      return {
        url: joinUrl(apiBase, 'models'),
        headers: {
          'x-goog-api-key': apiKey
        },
        parser: 'gemini-models'
      };
    }

    return {
      url: joinUrl(apiBase, 'models'),
      headers: {
        Authorization: bearer(apiKey)
      },
      parser: 'openai-models'
    };
  }

  function bearer(apiKey) {
    return /^bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${apiKey}`;
  }

  function parseApiResponse(data, parser) {
    let text = '';
    if (parser === 'gemini') {
      text = (data?.candidates?.[0]?.content?.parts || [])
        .map((part) => part.text || '')
        .join('\n')
        .trim();
    } else if (parser === 'anthropic') {
      text = (data?.content || [])
        .map((part) => part.text || '')
        .join('\n')
        .trim();
    } else if (parser === 'openai-responses') {
      text = data?.output_text || collectResponsesText(data);
    } else {
      text = data?.choices?.[0]?.message?.content || data?.message?.content || data?.text || '';
    }
    return normalizeModelText(text);
  }

  function parseModelsResponse(data, parser, config) {
    const provider = providerOf(config);
    let models = [];
    if (parser === 'gemini-models') {
      models = (data?.models || [])
        .map((item) => item.name || item.id || '')
        .map((name) => name.replace(/^models\//, ''));
    } else {
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      models = list.map((item) => {
        if (typeof item === 'string') return item;
        return item.id || item.name || item.model_id || item.modelId || '';
      });
    }

    const unique = [];
    const seen = new Set();
    for (const model of [...(provider.modelPresets || []), ...models]) {
      const value = String(model || '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      unique.push(value);
    }

    return unique.sort((a, b) => modelPriority(a, provider, config) - modelPriority(b, provider, config) || a.localeCompare(b));
  }

  function modelPriority(model, provider, config) {
    const lower = String(model || '').toLowerCase();
    if (provider.id === 'modelscope' && model === PROVIDERS.modelscope.model) return -50;
    if (config?.model && model === config.model) return -40;
    if (lower.includes('qwen3.5')) return -30;
    if (lower.includes('vl') || lower.includes('vision')) return -20;
    if (lower.includes('qwen')) return -10;
    return 0;
  }

  function collectResponsesText(data) {
    const out = [];
    for (const item of data?.output || []) {
      for (const content of item?.content || []) {
        if (content.text) out.push(content.text);
      }
    }
    return out.join('\n').trim();
  }

  function normalizeModelText(rawText) {
    const content = String(rawText || '').trim();
    if (!content) {
      return {
        text_prompt: '',
        json_prompt: '',
        raw: ''
      };
    }
    const jsonText = extractJsonText(content);
    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText);
        const textPrompt = String(parsed.text_prompt || parsed.prompt || content || '').trim();
        const jsonPrompt = parsed.json_prompt === undefined
          ? ''
          : (typeof parsed.json_prompt === 'string' ? parsed.json_prompt : JSON.stringify(parsed.json_prompt, null, 2));
        return {
          text_prompt: textPrompt,
          json_prompt: jsonPrompt,
          raw: content
        };
      } catch (_) {
        // 解析失败时返回原文，避免丢结果。
      }
    }
    return {
      text_prompt: content,
      json_prompt: '',
      raw: content
    };
  }

  function extractJsonText(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) return fenced[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return text.slice(start, end + 1).trim();
    return '';
  }

  function formatCopyPayload(entry, mode) {
    if (mode === 'all') {
      return [
        '【文字提示词】',
        entry.textPrompt || '',
        '',
        '【JSON 提示词】',
        entry.jsonPrompt || ''
      ].join('\n');
    }
    if (mode === 'json') return entry.jsonPrompt || entry.textPrompt || '';
    return entry.textPrompt || '';
  }

  function providerOptionsHtml(selected) {
    return Object.values(PROVIDERS).map((provider) => {
      const isSelected = provider.id === selected ? ' selected' : '';
      return `<option value="${escapeHtml(provider.id)}"${isSelected}>${escapeHtml(provider.label)}</option>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function formatTime(iso) {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(iso));
    } catch (_) {
      return '';
    }
  }

  global.I2P = {
    VERSION,
    PROMPTS,
    PROVIDERS,
    DEFAULT_SETTINGS,
    makeDefaultConfig,
    providerOf,
    promptFor,
    buildApiRequest,
    buildModelsRequest,
    parseApiResponse,
    parseModelsResponse,
    formatCopyPayload,
    providerOptionsHtml,
    escapeHtml,
    formatTime,
    isHttpUrl,
    isDataUrl,
    parseDataUrl
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
