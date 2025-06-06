
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, Users, Briefcase, GraduationCap } from "lucide-react";

const Team = () => {
  const teamMembers = [
    {
      name: "Ana Silva",
      role: "Estrategista Sênior",
      specialties: ["Google Ads", "Meta Ads", "Analytics"],
      experience: "8+ anos",
      certifications: ["Google Ads Certified", "Meta Blueprint", "Google Analytics"]
    },
    {
      name: "Carlos Oliveira",
      role: "Especialista em Landing Pages",
      specialties: ["UX/UI", "CRO", "Frontend"],
      experience: "6+ anos",
      certifications: ["UX Design", "CRO Specialist", "Webflow Expert"]
    },
    {
      name: "Maria Santos",
      role: "Analista de Performance",
      specialties: ["Data Science", "BI", "Dashboards"],
      experience: "5+ anos",
      certifications: ["Google Analytics", "Power BI", "Data Studio"]
    }
  ];

  return (
    <section id="team" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 animate-fade-in-up">
          <span className="inline-block px-4 py-2 bg-brand-gradient text-white rounded-full text-sm font-medium mb-4">
            Nossa Equipe
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-brand-navy mb-6">
            Especialistas
            <span className="block text-brand-orange">Certificados</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Profissionais com vasta experiência e certificações nas principais plataformas de marketing digital. 
            Dedicação total aos resultados dos nossos clientes.
          </p>
        </div>

        {/* Team Stats */}
        <div className="grid md:grid-cols-4 gap-8 mb-16">
          <div className="text-center p-6 bg-brand-gradient rounded-2xl text-white">
            <Users className="h-12 w-12 mx-auto mb-4" />
            <div className="text-3xl font-bold">15+</div>
            <div className="text-white/90">Especialistas</div>
          </div>
          <div className="text-center p-6 bg-brand-navy rounded-2xl text-white">
            <Award className="h-12 w-12 mx-auto mb-4 text-yellow-300" />
            <div className="text-3xl font-bold">50+</div>
            <div className="text-white/90">Certificações</div>
          </div>
          <div className="text-center p-6 bg-brand-gradient rounded-2xl text-white">
            <Briefcase className="h-12 w-12 mx-auto mb-4" />
            <div className="text-3xl font-bold">1000+</div>
            <div className="text-white/90">Projetos</div>
          </div>
          <div className="text-center p-6 bg-brand-navy rounded-2xl text-white">
            <GraduationCap className="h-12 w-12 mx-auto mb-4 text-yellow-300" />
            <div className="text-3xl font-bold">10+</div>
            <div className="text-white/90">Anos Experiência</div>
          </div>
        </div>

        {/* Team Members */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {teamMembers.map((member, index) => (
            <Card key={index} className="group hover:shadow-xl transition-all duration-300 hover:-translate-y-2 overflow-hidden">
              <CardHeader className="text-center pb-4">
                <div className="w-24 h-24 bg-brand-gradient rounded-full mx-auto mb-4 flex items-center justify-center text-white text-2xl font-bold">
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                <h3 className="text-xl font-bold text-brand-navy group-hover:text-brand-orange transition-colors">
                  {member.name}
                </h3>
                <p className="text-brand-orange font-semibold">{member.role}</p>
                <div className="flex items-center justify-center text-muted-foreground text-sm">
                  <Briefcase className="h-4 w-4 mr-1" />
                  {member.experience}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-brand-navy mb-2">Especialidades:</h4>
                  <div className="flex flex-wrap gap-2">
                    {member.specialties.map((specialty, idx) => (
                      <Badge key={idx} variant="secondary" className="bg-brand-orange/10 text-brand-orange">
                        {specialty}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-brand-navy mb-2">Certificações:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {member.certifications.map((cert, idx) => (
                      <li key={idx} className="flex items-center">
                        <Award className="h-3 w-3 text-brand-orange mr-2" />
                        {cert}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Call to Action */}
        <div className="text-center bg-muted/50 rounded-3xl p-8">
          <h3 className="text-2xl font-bold text-brand-navy mb-4">
            Pronto para conhecer nossa equipe pessoalmente?
          </h3>
          <p className="text-muted-foreground mb-6">
            Agende uma reunião e conheça os especialistas que irão impulsionar seu negócio.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-brand-gradient text-white px-8 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity">
              Agendar Reunião
            </button>
            <button className="border border-brand-orange text-brand-orange px-8 py-3 rounded-lg font-semibold hover:bg-brand-orange hover:text-white transition-colors">
              Ver Certificações
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Team;
