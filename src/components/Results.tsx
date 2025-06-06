
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Target, DollarSign, Users, BarChart3, Zap } from "lucide-react";

const Results = () => {
  const results = [
    {
      icon: <TrendingUp className="h-8 w-8 text-brand-orange" />,
      number: "+300%",
      label: "Aumento no ROI",
      description: "Retorno sobre investimento médio dos nossos clientes"
    },
    {
      icon: <Target className="h-8 w-8 text-brand-orange" />,
      number: "40%",
      label: "Taxa de Conversão",
      description: "Conversão média das landing pages otimizadas"
    },
    {
      icon: <DollarSign className="h-8 w-8 text-brand-orange" />,
      number: "60%",
      label: "Redução no CPA",
      description: "Diminuição no custo por aquisição de clientes"
    },
    {
      icon: <Users className="h-8 w-8 text-brand-orange" />,
      number: "+250%",
      label: "Aumento em Leads",
      description: "Crescimento médio na geração de leads qualificados"
    },
    {
      icon: <BarChart3 className="h-8 w-8 text-brand-orange" />,
      number: "85%",
      label: "Precisão de Segmentação",
      description: "Eficiência na segmentação de público-alvo"
    },
    {
      icon: <Zap className="h-8 w-8 text-brand-orange" />,
      number: "24h",
      label: "Tempo de Resposta",
      description: "Suporte rápido e atendimento personalizado"
    }
  ];

  const caseStudies = [
    {
      client: "E-commerce de Moda",
      challenge: "Baixa conversão e alto CPA",
      solution: "Otimização de campanhas + Landing Pages",
      result: "+400% ROI em 3 meses"
    },
    {
      client: "Clínica Médica",
      challenge: "Falta de leads qualificados",
      solution: "Segmentação inteligente + Chatbot IA",
      result: "+200 pacientes/mês"
    },
    {
      client: "SaaS B2B",
      challenge: "Alto custo de aquisição",
      solution: "Funil otimizado + Remarketing",
      result: "50% redução no CAC"
    }
  ];

  return (
    <section id="results" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 animate-fade-in-up">
          <span className="inline-block px-4 py-2 bg-brand-gradient text-white rounded-full text-sm font-medium mb-4">
            Resultados Comprovados
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-brand-navy mb-6">
            Números que
            <span className="block text-brand-orange">Impressionam</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Nossos clientes conquistam resultados extraordinários com estratégias personalizadas 
            e acompanhamento contínuo de performance.
          </p>
        </div>

        {/* Results Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {results.map((result, index) => (
            <Card key={index} className="text-center group hover:shadow-xl transition-all duration-300 hover:-translate-y-2 border-t-4 border-t-brand-orange">
              <CardHeader className="pb-4">
                <div className="mx-auto mb-4 p-4 bg-brand-orange/10 rounded-full w-fit group-hover:bg-brand-gradient group-hover:text-white transition-all duration-300">
                  {result.icon}
                </div>
                <CardTitle className="text-4xl font-bold text-brand-navy group-hover:text-brand-orange transition-colors">
                  {result.number}
                </CardTitle>
                <div className="text-lg font-semibold text-brand-orange">
                  {result.label}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {result.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Case Studies */}
        <div className="bg-brand-navy text-white rounded-3xl p-8 md:p-12">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-bold mb-4">
              Casos de <span className="text-yellow-300">Sucesso</span>
            </h3>
            <p className="text-xl text-white/90">
              Veja como transformamos desafios em oportunidades de crescimento
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {caseStudies.map((study, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 hover:bg-white/20 transition-all duration-300">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xl font-bold text-yellow-300 mb-2">
                      {study.client}
                    </h4>
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="font-semibold text-white/80">Desafio: </span>
                        <span className="text-white/70">{study.challenge}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-white/80">Solução: </span>
                        <span className="text-white/70">{study.solution}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-white/80">Resultado: </span>
                        <span className="text-yellow-300 font-bold">{study.result}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Results;
