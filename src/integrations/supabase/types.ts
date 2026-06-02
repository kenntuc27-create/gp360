export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      adherence_alerts: {
        Row: {
          alert_type: string | null
          created_at: string | null
          employee_id: string
          id: string
          message: string
          reference_date: string | null
          resolved: boolean | null
          severity: string
        }
        Insert: {
          alert_type?: string | null
          created_at?: string | null
          employee_id: string
          id?: string
          message: string
          reference_date?: string | null
          resolved?: boolean | null
          severity?: string
        }
        Update: {
          alert_type?: string | null
          created_at?: string | null
          employee_id?: string
          id?: string
          message?: string
          reference_date?: string | null
          resolved?: boolean | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "adherence_alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      adherence_status: {
        Row: {
          created_at: string | null
          details: string | null
          employee_id: string
          id: string
          production_ok: boolean | null
          reference_date: string
          status: string
        }
        Insert: {
          created_at?: string | null
          details?: string | null
          employee_id: string
          id?: string
          production_ok?: boolean | null
          reference_date: string
          status: string
        }
        Update: {
          created_at?: string | null
          details?: string | null
          employee_id?: string
          id?: string
          production_ok?: boolean | null
          reference_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "adherence_status_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bid_deliveries: {
        Row: {
          bid_id: string
          created_at: string | null
          delivery_date: string | null
          delivery_time: string | null
          empenho_numero: string | null
          id: string
          local_entrega: string | null
          nfe_chave: string | null
          nfe_numero: string | null
          observacoes: string | null
          ordem_fornecimento: string | null
          paid_amount: number | null
          paid_at: string | null
          responsavel: string | null
          status: string | null
          transportadora: string | null
        }
        Insert: {
          bid_id: string
          created_at?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          empenho_numero?: string | null
          id?: string
          local_entrega?: string | null
          nfe_chave?: string | null
          nfe_numero?: string | null
          observacoes?: string | null
          ordem_fornecimento?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          responsavel?: string | null
          status?: string | null
          transportadora?: string | null
        }
        Update: {
          bid_id?: string
          created_at?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          empenho_numero?: string | null
          id?: string
          local_entrega?: string | null
          nfe_chave?: string | null
          nfe_numero?: string | null
          observacoes?: string | null
          ordem_fornecimento?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          responsavel?: string | null
          status?: string | null
          transportadora?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_deliveries_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_delivery_acceptance: {
        Row: {
          acceptance_date: string | null
          created_at: string | null
          delivery_id: string
          id: string
          observacoes: string | null
          orgao_setor: string | null
          pdf_url: string | null
          servidor_cargo: string | null
          servidor_cpf: string | null
          servidor_matricula: string | null
          servidor_nome: string | null
          signature_data_url: string | null
        }
        Insert: {
          acceptance_date?: string | null
          created_at?: string | null
          delivery_id: string
          id?: string
          observacoes?: string | null
          orgao_setor?: string | null
          pdf_url?: string | null
          servidor_cargo?: string | null
          servidor_cpf?: string | null
          servidor_matricula?: string | null
          servidor_nome?: string | null
          signature_data_url?: string | null
        }
        Update: {
          acceptance_date?: string | null
          created_at?: string | null
          delivery_id?: string
          id?: string
          observacoes?: string | null
          orgao_setor?: string | null
          pdf_url?: string | null
          servidor_cargo?: string | null
          servidor_cpf?: string | null
          servidor_matricula?: string | null
          servidor_nome?: string | null
          signature_data_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_delivery_acceptance_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "bid_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_delivery_checklist: {
        Row: {
          confirmacao_orgao: boolean | null
          created_at: string | null
          danfe_anexada: boolean | null
          delivery_id: string
          empenho_anexado: boolean | null
          evidencias_anexadas: boolean | null
          id: string
          mercadoria_entregue: boolean | null
          nfe_emitida: boolean | null
          of_anexada: boolean | null
          termo_assinado: boolean | null
        }
        Insert: {
          confirmacao_orgao?: boolean | null
          created_at?: string | null
          danfe_anexada?: boolean | null
          delivery_id: string
          empenho_anexado?: boolean | null
          evidencias_anexadas?: boolean | null
          id?: string
          mercadoria_entregue?: boolean | null
          nfe_emitida?: boolean | null
          of_anexada?: boolean | null
          termo_assinado?: boolean | null
        }
        Update: {
          confirmacao_orgao?: boolean | null
          created_at?: string | null
          danfe_anexada?: boolean | null
          delivery_id?: string
          empenho_anexado?: boolean | null
          evidencias_anexadas?: boolean | null
          id?: string
          mercadoria_entregue?: boolean | null
          nfe_emitida?: boolean | null
          of_anexada?: boolean | null
          termo_assinado?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_delivery_checklist_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "bid_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_delivery_evidences: {
        Row: {
          created_at: string | null
          delivery_id: string
          id: string
          mime_type: string | null
          nome: string | null
          size_bytes: number | null
          tipo: string | null
          uploaded_at: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_id: string
          id?: string
          mime_type?: string | null
          nome?: string | null
          size_bytes?: number | null
          tipo?: string | null
          uploaded_at?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_id?: string
          id?: string
          mime_type?: string | null
          nome?: string | null
          size_bytes?: number | null
          tipo?: string | null
          uploaded_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_delivery_evidences_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "bid_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_items: {
        Row: {
          bid_id: string
          categoria: string | null
          catmat: string | null
          chosen_manual: boolean | null
          chosen_response_id: string | null
          created_at: string
          custo_unitario: number | null
          descricao: string
          disputar: boolean | null
          dispute_value: number | null
          estimated_value: number | null
          homologated_value: number | null
          id: string
          invoiced_value: number | null
          item_number: number
          lote: string | null
          marca: string | null
          margin_pct: number | null
          me_epp: boolean | null
          modelo: string | null
          needs_review: boolean
          observacao: string | null
          prazo: string | null
          preco_homologado: number | null
          preco_modo: string | null
          preco_venda_manual: number | null
          profit_margin_pct: number | null
          profit_value: number | null
          quantidade: number
          quoted_value: number | null
          received_value: number | null
          status: string | null
          unidade: string | null
          valor_estimado_total: number | null
          valor_maximo: number | null
          valor_unitario: number | null
          venceu: boolean | null
        }
        Insert: {
          bid_id: string
          categoria?: string | null
          catmat?: string | null
          chosen_manual?: boolean | null
          chosen_response_id?: string | null
          created_at?: string
          custo_unitario?: number | null
          descricao?: string
          disputar?: boolean | null
          dispute_value?: number | null
          estimated_value?: number | null
          homologated_value?: number | null
          id?: string
          invoiced_value?: number | null
          item_number?: number
          lote?: string | null
          marca?: string | null
          margin_pct?: number | null
          me_epp?: boolean | null
          modelo?: string | null
          needs_review?: boolean
          observacao?: string | null
          prazo?: string | null
          preco_homologado?: number | null
          preco_modo?: string | null
          preco_venda_manual?: number | null
          profit_margin_pct?: number | null
          profit_value?: number | null
          quantidade?: number
          quoted_value?: number | null
          received_value?: number | null
          status?: string | null
          unidade?: string | null
          valor_estimado_total?: number | null
          valor_maximo?: number | null
          valor_unitario?: number | null
          venceu?: boolean | null
        }
        Update: {
          bid_id?: string
          categoria?: string | null
          catmat?: string | null
          chosen_manual?: boolean | null
          chosen_response_id?: string | null
          created_at?: string
          custo_unitario?: number | null
          descricao?: string
          disputar?: boolean | null
          dispute_value?: number | null
          estimated_value?: number | null
          homologated_value?: number | null
          id?: string
          invoiced_value?: number | null
          item_number?: number
          lote?: string | null
          marca?: string | null
          margin_pct?: number | null
          me_epp?: boolean | null
          modelo?: string | null
          needs_review?: boolean
          observacao?: string | null
          prazo?: string | null
          preco_homologado?: number | null
          preco_modo?: string | null
          preco_venda_manual?: number | null
          profit_margin_pct?: number | null
          profit_value?: number | null
          quantidade?: number
          quoted_value?: number | null
          received_value?: number | null
          status?: string | null
          unidade?: string | null
          valor_estimado_total?: number | null
          valor_maximo?: number | null
          valor_unitario?: number | null
          venceu?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_items_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_supplier_item_prices: {
        Row: {
          bid_item_id: string
          created_at: string | null
          divergence_reason: string | null
          fator_conversao: number | null
          frete_unitario: number | null
          id: string
          imposto_pct: number | null
          marca: string | null
          needs_review: boolean | null
          observacao: string | null
          prazo: string | null
          preco_embalagem_fornecedor: number | null
          response_id: string
          supplier_discount_type: string | null
          supplier_discount_value: number | null
          unidade_fornecedor: string | null
          valor_unitario: number | null
        }
        Insert: {
          bid_item_id: string
          created_at?: string | null
          divergence_reason?: string | null
          fator_conversao?: number | null
          frete_unitario?: number | null
          id?: string
          imposto_pct?: number | null
          marca?: string | null
          needs_review?: boolean | null
          observacao?: string | null
          prazo?: string | null
          preco_embalagem_fornecedor?: number | null
          response_id: string
          supplier_discount_type?: string | null
          supplier_discount_value?: number | null
          unidade_fornecedor?: string | null
          valor_unitario?: number | null
        }
        Update: {
          bid_item_id?: string
          created_at?: string | null
          divergence_reason?: string | null
          fator_conversao?: number | null
          frete_unitario?: number | null
          id?: string
          imposto_pct?: number | null
          marca?: string | null
          needs_review?: boolean | null
          observacao?: string | null
          prazo?: string | null
          preco_embalagem_fornecedor?: number | null
          response_id?: string
          supplier_discount_type?: string | null
          supplier_discount_value?: number | null
          unidade_fornecedor?: string | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_supplier_item_prices_bid_item_id_fkey"
            columns: ["bid_item_id"]
            isOneToOne: false
            referencedRelation: "bid_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_supplier_item_prices_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "bid_supplier_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_supplier_responses: {
        Row: {
          bid_id: string
          created_at: string | null
          extraction_error: string | null
          extraction_progress: number | null
          extraction_status: string | null
          extraction_total: number | null
          freight_value: number
          global_discount_type: string | null
          global_discount_value: number | null
          id: string
          observations: string | null
          proposal_validity: string | null
          raw_text: string | null
          response_date: string | null
          source_file_name: string | null
          source_file_url: string | null
          supplier_id: string
        }
        Insert: {
          bid_id: string
          created_at?: string | null
          extraction_error?: string | null
          extraction_progress?: number | null
          extraction_status?: string | null
          extraction_total?: number | null
          freight_value?: number
          global_discount_type?: string | null
          global_discount_value?: number | null
          id?: string
          observations?: string | null
          proposal_validity?: string | null
          raw_text?: string | null
          response_date?: string | null
          source_file_name?: string | null
          source_file_url?: string | null
          supplier_id: string
        }
        Update: {
          bid_id?: string
          created_at?: string | null
          extraction_error?: string | null
          extraction_progress?: number | null
          extraction_status?: string | null
          extraction_total?: number | null
          freight_value?: number
          global_discount_type?: string | null
          global_discount_value?: number | null
          id?: string
          observations?: string | null
          proposal_validity?: string | null
          raw_text?: string | null
          response_date?: string | null
          source_file_name?: string | null
          source_file_url?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bid_supplier_responses_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_supplier_responses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      bids: {
        Row: {
          bought_total: number | null
          cidade_orgao: string | null
          created_at: string
          data_abertura: string | null
          data_encerramento_propostas: string | null
          data_inicio_propostas: string | null
          data_limite_entrega: string | null
          endereco_orgao: string | null
          estado_orgao: string | null
          extraction_method: string | null
          extraction_score: number | null
          id: string
          local_entrega: string | null
          modalidade: string | null
          objeto: string | null
          orgao: string | null
          orgao_pagador: string | null
          prazo_entrega: string | null
          prazo_pagamento: string | null
          processo: string | null
          profit_value: number | null
          raw_text: string | null
          resultado: string | null
          segment_id: string | null
          sold_total: number | null
          source_file_name: string | null
          source_file_url: string | null
          status: string
          structural_map: Json | null
          tipo_cotacao: string | null
          total_dispute: number | null
          total_estimated: number | null
          total_homologated: number | null
          total_margin_real_pct: number | null
          total_profit_real: number | null
          total_quoted: number | null
          uasg: string | null
          updated_at: string
          valor_total_estimado: number | null
        }
        Insert: {
          bought_total?: number | null
          cidade_orgao?: string | null
          created_at?: string
          data_abertura?: string | null
          data_encerramento_propostas?: string | null
          data_inicio_propostas?: string | null
          data_limite_entrega?: string | null
          endereco_orgao?: string | null
          estado_orgao?: string | null
          extraction_method?: string | null
          extraction_score?: number | null
          id?: string
          local_entrega?: string | null
          modalidade?: string | null
          objeto?: string | null
          orgao?: string | null
          orgao_pagador?: string | null
          prazo_entrega?: string | null
          prazo_pagamento?: string | null
          processo?: string | null
          profit_value?: number | null
          raw_text?: string | null
          resultado?: string | null
          segment_id?: string | null
          sold_total?: number | null
          source_file_name?: string | null
          source_file_url?: string | null
          status?: string
          structural_map?: Json | null
          tipo_cotacao?: string | null
          total_dispute?: number | null
          total_estimated?: number | null
          total_homologated?: number | null
          total_margin_real_pct?: number | null
          total_profit_real?: number | null
          total_quoted?: number | null
          uasg?: string | null
          updated_at?: string
          valor_total_estimado?: number | null
        }
        Update: {
          bought_total?: number | null
          cidade_orgao?: string | null
          created_at?: string
          data_abertura?: string | null
          data_encerramento_propostas?: string | null
          data_inicio_propostas?: string | null
          data_limite_entrega?: string | null
          endereco_orgao?: string | null
          estado_orgao?: string | null
          extraction_method?: string | null
          extraction_score?: number | null
          id?: string
          local_entrega?: string | null
          modalidade?: string | null
          objeto?: string | null
          orgao?: string | null
          orgao_pagador?: string | null
          prazo_entrega?: string | null
          prazo_pagamento?: string | null
          processo?: string | null
          profit_value?: number | null
          raw_text?: string | null
          resultado?: string | null
          segment_id?: string | null
          sold_total?: number | null
          source_file_name?: string | null
          source_file_url?: string | null
          status?: string
          structural_map?: Json | null
          tipo_cotacao?: string | null
          total_dispute?: number | null
          total_estimated?: number | null
          total_homologated?: number | null
          total_margin_real_pct?: number | null
          total_profit_real?: number | null
          total_quoted?: number | null
          uasg?: string | null
          updated_at?: string
          valor_total_estimado?: number | null
        }
        Relationships: []
      }
      business_goals: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          reference_month: string
          target_amount: number | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          reference_month: string
          target_amount?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          reference_month?: string
          target_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_goals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          name: string
          slug: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name: string
          slug?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name?: string
          slug?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          active: boolean | null
          business_id: string | null
          cnpj: string | null
          created_at: string | null
          declaracoes: string[] | null
          display_name: string | null
          id: string
          name: string
          razao_social: string | null
          tipo: string | null
        }
        Insert: {
          active?: boolean | null
          business_id?: string | null
          cnpj?: string | null
          created_at?: string | null
          declaracoes?: string[] | null
          display_name?: string | null
          id?: string
          name: string
          razao_social?: string | null
          tipo?: string | null
        }
        Update: {
          active?: boolean | null
          business_id?: string | null
          cnpj?: string | null
          created_at?: string | null
          declaracoes?: string[] | null
          display_name?: string | null
          id?: string
          name?: string
          razao_social?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          city: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          id: string
          logo_url: string | null
          phone: string | null
          primary_color: string | null
          proposal_validity_days: number | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          primary_color?: string | null
          proposal_validity_days?: number | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          primary_color?: string | null
          proposal_validity_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_production_metrics: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          metric_id: string | null
          notes: string | null
          production_date: string
          realized_value: number | null
          status: string | null
          submitted_at: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          metric_id?: string | null
          notes?: string | null
          production_date?: string
          realized_value?: number | null
          status?: string | null
          submitted_at?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          metric_id?: string | null
          notes?: string | null
          production_date?: string
          realized_value?: number | null
          status?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_production_metrics_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_production_metrics_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "sector_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      edital_imports: {
        Row: {
          created_at: string
          error_message: string | null
          extracted_json: Json | null
          file_name: string
          file_path: string
          id: string
          metadata: Json | null
          progress_pct: number
          status: Database["public"]["Enums"]["import_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          extracted_json?: Json | null
          file_name: string
          file_path: string
          id?: string
          metadata?: Json | null
          progress_pct?: number
          status?: Database["public"]["Enums"]["import_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          extracted_json?: Json | null
          file_name?: string
          file_path?: string
          id?: string
          metadata?: Json | null
          progress_pct?: number
          status?: Database["public"]["Enums"]["import_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      edital_logs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          import_id: string
          level: string
          message: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          import_id: string
          level: string
          message: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          import_id?: string
          level?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "edital_logs_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "edital_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      edital_staging_items: {
        Row: {
          catmat: string | null
          confidence_score: number | null
          created_at: string
          descricao: string
          id: string
          import_id: string
          item_number: number | null
          lote: string | null
          marca: string | null
          me_epp: boolean | null
          quantidade: number | null
          status: string | null
          unidade: string | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          catmat?: string | null
          confidence_score?: number | null
          created_at?: string
          descricao: string
          id?: string
          import_id: string
          item_number?: number | null
          lote?: string | null
          marca?: string | null
          me_epp?: boolean | null
          quantidade?: number | null
          status?: string | null
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          catmat?: string | null
          confidence_score?: number | null
          created_at?: string
          descricao?: string
          id?: string
          import_id?: string
          item_number?: number | null
          lote?: string | null
          marca?: string | null
          me_epp?: boolean | null
          quantidade?: number | null
          status?: string | null
          unidade?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "edital_staging_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "edital_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_businesses: {
        Row: {
          business_id: string
          created_at: string | null
          employee_id: string
          id: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          employee_id: string
          id?: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_businesses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_businesses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_goals: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          reference_month: string
          target_amount: number | null
          working_days: number | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          reference_month: string
          target_amount?: number | null
          working_days?: number | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          reference_month?: string
          target_amount?: number | null
          working_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_goals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean | null
          cargo: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          sector_id: string | null
          segmento: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          cargo?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          sector_id?: string | null
          segmento?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          cargo?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          sector_id?: string | null
          segmento?: string | null
          user_id?: string
        }
        Relationships: []
      }
      meeting_participants: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          meeting_id: string
          present: boolean | null
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          meeting_id: string
          present?: boolean | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          meeting_id?: string
          present?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: string | null
          area: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          guidelines: string | null
          id: string
          location: string | null
          meeting_date: string
          meeting_time: string | null
          meeting_type: string | null
          status: string | null
          title: string
        }
        Insert: {
          agenda?: string | null
          area?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          guidelines?: string | null
          id?: string
          location?: string | null
          meeting_date: string
          meeting_time?: string | null
          meeting_type?: string | null
          status?: string | null
          title: string
        }
        Update: {
          agenda?: string | null
          area?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          guidelines?: string | null
          id?: string
          location?: string | null
          meeting_date?: string
          meeting_time?: string | null
          meeting_type?: string | null
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      occurrences: {
        Row: {
          created_at: string | null
          description: string | null
          employee_id: string
          id: string
          occurrence_date: string
          severity: string | null
          source: string | null
          source_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          employee_id: string
          id?: string
          occurrence_date?: string
          severity?: string | null
          source?: string | null
          source_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          occurrence_date?: string
          severity?: string | null
          source?: string | null
          source_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_scores: {
        Row: {
          behavior_score: number | null
          classification: string | null
          created_at: string | null
          employee_id: string
          id: string
          previous_classification: string | null
          production_score: number | null
          reference_date: string
          score: number | null
          tasks_score: number | null
        }
        Insert: {
          behavior_score?: number | null
          classification?: string | null
          created_at?: string | null
          employee_id: string
          id?: string
          previous_classification?: string | null
          production_score?: number | null
          reference_date?: string
          score?: number | null
          tasks_score?: number | null
        }
        Update: {
          behavior_score?: number | null
          classification?: string | null
          created_at?: string | null
          employee_id?: string
          id?: string
          previous_classification?: string | null
          production_score?: number | null
          reference_date?: string
          score?: number | null
          tasks_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_scores_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_id: string | null
          cargo: string | null
          company_id: string | null
          company_tipo: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_blocked: boolean | null
          must_change_password: boolean | null
          nivel_acesso: string | null
          segmento: string | null
          setor: string | null
          updated_at: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          business_id?: string | null
          cargo?: string | null
          company_id?: string | null
          company_tipo?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean | null
          must_change_password?: boolean | null
          nivel_acesso?: string | null
          segmento?: string | null
          setor?: string | null
          updated_at?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          business_id?: string | null
          cargo?: string | null
          company_id?: string | null
          company_tipo?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean | null
          must_change_password?: boolean | null
          nivel_acesso?: string | null
          segmento?: string | null
          setor?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sector_metrics: {
        Row: {
          active: boolean | null
          created_at: string | null
          daily_goal: number | null
          id: string
          name: string | null
          reference_month: string
          sector_id: string
          sort_order: number | null
          unit: string | null
          value_type: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          daily_goal?: number | null
          id?: string
          name?: string | null
          reference_month: string
          sector_id: string
          sort_order?: number | null
          unit?: string | null
          value_type?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          daily_goal?: number | null
          id?: string
          name?: string | null
          reference_month?: string
          sector_id?: string
          sort_order?: number | null
          unit?: string | null
          value_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sector_metrics_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          business_id: string | null
          created_at: string | null
          id: string
          is_operational: boolean | null
          monthly_revenue_target: number | null
          name: string
          working_days: number | null
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_operational?: boolean | null
          monthly_revenue_target?: number | null
          name: string
          working_days?: number | null
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          id?: string
          is_operational?: boolean | null
          monthly_revenue_target?: number | null
          name?: string
          working_days?: number | null
        }
        Relationships: []
      }
      segments: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          cidade: string | null
          cnpj: string | null
          contato: string | null
          created_at: string
          email: string | null
          id: string
          performance_metrics: Json | null
          razao_social: string
          segmento: string | null
          telefone: string | null
          tipo: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          contato?: string | null
          created_at?: string
          email?: string | null
          id?: string
          performance_metrics?: Json | null
          razao_social: string
          segmento?: string | null
          telefone?: string | null
          tipo?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          contato?: string | null
          created_at?: string
          email?: string | null
          id?: string
          performance_metrics?: Json | null
          razao_social?: string
          segmento?: string | null
          telefone?: string | null
          tipo?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      system_configs: {
        Row: {
          created_at: string | null
          id: string
          key: string
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          value?: Json | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          source: string | null
          source_id: string | null
          status: string | null
          title: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          source?: string | null
          source_id?: string | null
          status?: string | null
          title: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          source?: string | null
          source_id?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      time_punches: {
        Row: {
          classification: string | null
          created_at: string | null
          delay_minutes: number | null
          employee_id: string
          id: string
          punch_date: string
          punch_time: string | null
          punch_type: string
          source: string | null
        }
        Insert: {
          classification?: string | null
          created_at?: string | null
          delay_minutes?: number | null
          employee_id: string
          id?: string
          punch_date?: string
          punch_time?: string | null
          punch_type: string
          source?: string | null
        }
        Update: {
          classification?: string | null
          created_at?: string | null
          delay_minutes?: number | null
          employee_id?: string
          id?: string
          punch_date?: string
          punch_time?: string | null
          punch_type?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_access_logs: {
        Row: {
          action: string | null
          created_at: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: string
          sector_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: string
          sector_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          sector_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      work_schedules: {
        Row: {
          break_end: string | null
          break_start: string | null
          created_at: string | null
          employee_id: string
          end_time: string | null
          id: string
          is_off: boolean | null
          start_time: string | null
          weekday: number
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string | null
          employee_id: string
          end_time?: string | null
          id?: string
          is_off?: boolean | null
          start_time?: string | null
          weekday: number
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          created_at?: string | null
          employee_id?: string
          end_time?: string | null
          id?: string
          is_off?: boolean | null
          start_time?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_performance_scores: {
        Args: { _date: string }
        Returns: undefined
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      recompute_adherence: {
        Args: { _date: string; _employee_id: string }
        Returns: undefined
      }
      resolve_login_email: { Args: { _identifier: string }; Returns: string }
    }
    Enums: {
      import_status:
        | "pending"
        | "processing_ocr"
        | "processing_ai"
        | "completed"
        | "error"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      import_status: [
        "pending",
        "processing_ocr",
        "processing_ai",
        "completed",
        "error",
      ],
    },
  },
} as const
