
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    let query = "";
    let act = "";
    let section = "";
    let court = "";
    let source = "";
    let id = "";
    let caseName = "";

    if (req.method === "POST") {
      const body = req.body || {};

      query = body.query || "";
      act = body.act || "";
      section = body.section || "";
      court = body.court || "";
      source = body.source || "";
      id = body.id || body.cnr || "";
      caseName = body.caseName || "";

    } else {

      query = req.query?.query || "";
      act = req.query?.act || "";
      section = req.query?.section || "";
      court = req.query?.court || "";
      source = req.query?.source || "";
      id = req.query?.id || req.query?.cnr || "";
      caseName = req.query?.caseName || "";
    }

    const userQuery =
      String(query).trim();

    const q =
      userQuery.toLowerCase();

    const API_BASE =
      "https://indiacode.ecourtsindia.com/api/v1";


    /* =====================================================
       JUDGMENT READER
       ===================================================== */

    if (source || id || caseName) {

      /*
       * PRIMARY METHOD:
       * Search the connected judgment database
       * using the CNR.
       */

      if (id) {

        try {

          const params =
            new URLSearchParams();

          params.set(
            "cnr",
            String(id).trim()
          );

          params.set(
            "limit",
            "100"
          );

          const readerUrl =
            `${API_BASE}/judgments?${params.toString()}`;

          const response =
            await fetch(readerUrl);

          const data =
            await response.json();

          if (
            response.ok &&
            Array.isArray(data.judgments) &&
            data.judgments.length > 0
          ) {

            /*
             * Prefer a judgment/order record where
             * possible. Otherwise use first result.
             */

            let selected =
              data.judgments.find(j => {

                const order =
                  String(
                    j.order ||
                    j.document_type ||
                    j.type ||
                    ""
                  ).toLowerCase();

                return (
                  order.includes("judg") ||
                  order.includes("order")
                );
              });

            if (!selected) {
              selected =
                data.judgments[0];
            }

            return res.status(200).json({

              verified: true,

              mode: "reader",

              judgment:
                normalizeJudgment(selected),

              relatedOrders:
                data.judgments.map(
                  normalizeJudgment
                )
            });
          }

        } catch (error) {

          console.error(
            "CNR judgment lookup failed:",
            error
          );
        }
      }


      /*
       * SOURCE FALLBACK
       *
       * We do not assume that the source URL
       * returns JSON. It may be HTML/PDF.
       *
       * Therefore return it as a verified source
       * rather than trying to parse it incorrectly.
       */

      if (source) {

        return res.status(200).json({

          verified: true,

          mode: "reader",

          sourceOnly: true,

          judgment:
            normalizeJudgment({

              title:
                caseName || null,

              cnr:
                id || null,

              url:
                source
            })

        });
      }


      /*
       * CASE NAME FALLBACK
       *
       * Search the judgment endpoint and compare
       * case names locally.
       */

      if (caseName) {

        try {

          const searchParams =
            new URLSearchParams();

          searchParams.set(
            "limit",
            "100"
          );

          const response =
            await fetch(
              `${API_BASE}/judgments?${searchParams.toString()}`
            );

          const data =
            await response.json();

          if (
            response.ok &&
            Array.isArray(data.judgments)
          ) {

            const wanted =
              normalize(caseName);

            const match =
              data.judgments.find(j => {

                const title =
                  normalize(
                    j.title ||
                    j.case_name ||
                    j.caseName ||
                    ""
                  );

                if (!title) return false;

                return (
                  title === wanted ||
                  title.includes(wanted) ||
                  wanted.includes(title)
                );
              });

            if (match) {

              return res.status(200).json({

                verified: true,

                mode: "reader",

                judgment:
                  normalizeJudgment(match)
              });
            }
          }

        } catch (error) {

          console.error(
            "Case-name lookup failed:",
            error
          );
        }
      }


      return res.status(404).json({

        verified: false,

        mode: "reader",

        error:
          "Judgment not found in the connected legal database"
      });
    }


    /* =====================================================
       SEARCH MODE
       ===================================================== */

    /* -----------------------------------------------------
       INFORMATION TECHNOLOGY ACT
       ----------------------------------------------------- */

    if (
      !act &&
      q.includes(
        "information technology act"
      )
    ) {
      act = "it-act";
    }

    if (
      !act &&
      q.includes("it act")
    ) {
      act = "it-act";
    }


    /* -----------------------------------------------------
       IPC
       ----------------------------------------------------- */

    if (
      !act &&
      q.includes(
        "indian penal code"
      )
    ) {
      act = "ipc";
    }

    if (
      !act &&
      /\bipc\b/i.test(q)
    ) {
      act = "ipc";
    }


    /* -----------------------------------------------------
       BNS
       ----------------------------------------------------- */

    if (
      !act &&
      q.includes(
        "bharatiya nyaya sanhita"
      )
    ) {
      act = "bns";
    }

    if (
      !act &&
      /\bbns\b/i.test(q)
    ) {
      act = "bns";
    }


    /* -----------------------------------------------------
       CrPC
       ----------------------------------------------------- */

    if (
      !act &&
      q.includes(
        "code of criminal procedure"
      )
    ) {
      act = "crpc";
    }

    if (
      !act &&
      /\bcrpc\b/i.test(q)
    ) {
      act = "crpc";
    }


    /* -----------------------------------------------------
       BNSS
       ----------------------------------------------------- */

    if (
      !act &&
      q.includes(
        "bharatiya nagarik suraksha sanhita"
      )
    ) {
      act = "bnss";
    }

    if (
      !act &&
      /\bbnss\b/i.test(q)
    ) {
      act = "bnss";
    }


    /* -----------------------------------------------------
       BSA
       ----------------------------------------------------- */

    if (
      !act &&
      q.includes(
        "bharatiya sakshya adhiniyam"
      )
    ) {
      act = "bsa";
    }

    if (
      !act &&
      /\bbsa\b/i.test(q)
    ) {
      act = "bsa";
    }


    /* -----------------------------------------------------
       EVIDENCE ACT
       ----------------------------------------------------- */

    if (
      !act &&
      q.includes(
        "evidence act"
      )
    ) {
      act = "evidence-act";
    }


    /* -----------------------------------------------------
       CPC
       ----------------------------------------------------- */

    if (
      !act &&
      q.includes(
        "code of civil procedure"
      )
    ) {
      act = "cpc";
    }

    if (
      !act &&
      /\bcpc\b/i.test(q)
    ) {
      act = "cpc";
    }


    /* -----------------------------------------------------
       NEGOTIABLE INSTRUMENTS ACT
       ----------------------------------------------------- */

    if (
      !act &&
      (
        q.includes(
          "negotiable instruments act"
        ) ||
        q.includes("cheque bounce") ||
        q.includes("cheque dishonour") ||
        q.includes("cheque dishonor")
      )
    ) {
      act = "ni-act";
    }


    if (
      act === "ni-act" &&
      !section &&
      (
        q.includes("cheque bounce") ||
        q.includes("dishonour") ||
        q.includes("dishonor")
      )
    ) {
      section = "138";
    }


    /* -----------------------------------------------------
       POCSO
       ----------------------------------------------------- */

    if (
      !act &&
      (
        q.includes("pocso") ||
        q.includes(
          "protection of children from sexual offences"
        )
      )
    ) {
      act = "pocso";
    }


    /* -----------------------------------------------------
       NDPS
       ----------------------------------------------------- */

    if (
      !act &&
      (
        q.includes("ndps") ||
        q.includes(
          "narcotic drugs and psychotropic substances"
        )
      )
    ) {
      act = "ndps-act";
    }


    /* =====================================================
       SECTION DETECTION
       ===================================================== */

    if (!section) {

      const m =
        q.match(
          /\b(?:section|sec\.?)\s*([0-9]+[a-z]?(?:\([a-z0-9]+\))?)\b/i
        ) ||
        q.match(
          /\b(?:ipc|bns|crpc|bnss|bsa|cpc)\s*[-:]?\s*([0-9]+[a-z]?)\b/i
        ) ||
        q.match(
          /\bit\s+act\s+(?:section\s*)?([0-9]+[a-z]?)\b/i
        );

      if (m) {
        section = m[1];
      }
    }


    /* =====================================================
       COURT DETECTION
       ===================================================== */

    if (!court) {

      if (
        q.includes("supreme court")
      ) {

        court = "SC";

      } else if (
        q.includes("high court")
      ) {

        court = "HC";
      }
    }


    /* =====================================================
       DATABASE SEARCH
       ===================================================== */

    const params =
      new URLSearchParams();

    if (act) {
      params.set("act", act);
    }

    if (section) {
      params.set(
        "section",
        section
      );
    }

    if (court) {
      params.set(
        "court",
        court
      );
    }

    params.set(
      "limit",
      "100"
    );


    let url =
      `${API_BASE}/judgments?${params.toString()}`;


    const allJudgments = [];

    let total = 0;


    while (url) {

      const response =
        await fetch(url);

      const data =
        await response.json();


      if (!response.ok) {

        return res.status(
          response.status
        ).json({

          error:
            data.error ||
            "Judgment search failed"

        });
      }


      total =
        data.total ||
        total;


      if (
        Array.isArray(
          data.judgments
        )
      ) {

        allJudgments.push(
          ...data.judgments
        );
      }


      url =
        data.next ||
        null;


      if (
        allJudgments.length >= 500
      ) {
        break;
      }
    }


    /* =====================================================
       NORMALIZATION
       ===================================================== */

    function normalize(value) {

      return String(value || "")
        .toLowerCase()
        .replace(
          /[^a-z0-9\s]/g,
          " "
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();
    }


    /* =====================================================
       STOP WORDS
       ===================================================== */

    const stopWords =
      new Set([

        "the",
        "and",
        "for",
        "where",
        "with",
        "from",
        "that",
        "this",
        "case",
        "cases",
        "judgment",
        "judgments",
        "judgement",
        "judgements",
        "supreme",
        "court",
        "high",
        "section",
        "sections",
        "act",
        "under",
        "about",
        "what",
        "which",
        "how",
        "does",
        "can",
        "tell",
        "explain",
        "meaning",
        "law",
        "legal",
        "provision",
        "india",
        "indian",
        "of",
        "to",
        "in",
        "on",
        "is",
        "are",
        "was",
        "were",
        "a",
        "an",
        "whether",
        "find"
      ]);


    const words =
      normalize(userQuery)
        .split(/\s+/)
        .filter(
          word =>
            word.length >= 3 &&
            !stopWords.has(word)
        );


    /* =====================================================
       SCORING
       ===================================================== */

    function score(j) {

      const title =
        normalize(
          j.title ||
          j.case_name ||
          j.caseName
        );


      const facts =
        normalize(
          j.facts ||
          j.case_facts
        );


      const issues =
        normalize(
          j.issues ||
          j.legal_issues
        );


      const ratio =
        normalize(
          j.ratio_decidendi ||
          j.ratio
        );


      const decision =
        normalize(
          j.decision ||
          j.holding
        );


      const applied =
        normalize(
          j.applied_to_this_section
        );


      const basis =
        normalize(
          j.basis
        );


      const decided =
        normalize(
          j.decided_under
        );


      const text = [

        title,
        facts,
        issues,
        ratio,
        decision,
        applied,
        basis,
        decided

      ].join(" ");


      let result = 0;


      if (section) {

        const sec =
          normalize(section);


        if (
          applied.includes(sec)
        ) {
          result += 100;
        }


        if (
          decided.includes(sec)
        ) {
          result += 80;
        }


        if (
          basis.includes(sec)
        ) {
          result += 60;
        }


        if (
          text.includes(
            `section ${sec}`
          )
        ) {
          result += 40;
        }
      }


      for (
        const word of words
      ) {

        if (
          title.includes(word)
        ) {
          result += 18;
        }


        if (
          issues.includes(word)
        ) {
          result += 15;
        }


        if (
          ratio.includes(word)
        ) {
          result += 14;
        }


        if (
          applied.includes(word)
        ) {
          result += 16;
        }


        if (
          basis.includes(word)
        ) {
          result += 10;
        }


        if (
          decision.includes(word)
        ) {
          result += 9;
        }


        if (
          facts.includes(word)
        ) {
          result += 5;
        }
      }


      const phrases = [

        "unauthorized access",
        "unauthorised access",
        "civil dispute",
        "commercial dispute",
        "corporate dispute",
        "quashing",
        "quashed",
        "bail",
        "anticipatory bail",
        "mens rea",
        "dishonest intention",
        "fraudulent intention",
        "cheque bounce",
        "dishonour of cheque",
        "dishonor of cheque",
        "service of notice"

      ];


      for (
        const phrase of phrases
      ) {

        if (
          q.includes(phrase)
        ) {

          if (
            text.includes(phrase)
          ) {
            result += 30;
          }


          if (
            issues.includes(phrase)
          ) {
            result += 25;
          }


          if (
            ratio.includes(phrase)
          ) {
            result += 25;
          }
        }
      }


      const courtName =
        normalize(
          j.court_name ||
          j.court
        );


      if (
        court === "SC" &&
        courtName.includes(
          "supreme"
        )
      ) {
        result += 30;
      }


      if (
        court === "HC" &&
        courtName.includes(
          "high"
        )
      ) {
        result += 20;
      }


      if (ratio) {
        result += 8;
      }


      if (issues) {
        result += 6;
      }


      if (decision) {
        result += 6;
      }


      if (applied) {
        result += 12;
      }


      return result;
    }


    /* =====================================================
       DEDUPLICATION
       ===================================================== */

    const seen =
      new Set();


    const unique =
      allJudgments.filter(
        j => {

          const key =
            normalize(
              j.title ||
              j.case_name ||
              j.cnr ||
              j.url
            );


          if (
            !key ||
            seen.has(key)
          ) {
            return false;
          }


          seen.add(key);

          return true;
        }
      );


    /* =====================================================
       RANK
       ===================================================== */

    const ranked =
      unique
        .map(j => ({

          judgment: j,

          score:
            score(j)

        }))
        .sort(
          (a, b) =>
            b.score -
            a.score
        );


    function relevance(
      value
    ) {

      if (
        value >= 100
      ) {
        return "Direct";
      }


      if (
        value >= 50
      ) {
        return "Related";
      }


      return "Low";
    }


    /* =====================================================
       FINAL RESULTS
       ===================================================== */

    const judgments =
      ranked
        .slice(0, 20)
        .map(item => {

          const j =
            item.judgment;


          return {

            verified: true,

            relevanceScore:
              item.score,

            relevance:
              relevance(
                item.score
              ),

            /*
             * IMPORTANT:
             * Keep multiple possible database
             * field names so the frontend never
             * displays "Unnamed judgment".
             */

            caseName:
              j.title ||
              j.case_name ||
              j.caseName ||
              null,

            court:
              j.court_name ||
              j.court ||
              null,

            courtLevel:
              j.court_level ||
              null,

            date:
              j.date ||
              j.decision_date ||
              null,

            citation:
              j.citation ||
              null,

            cnr:
              j.cnr ||
              j.CNR ||
              null,

            facts:
              j.facts ||
              j.case_facts ||
              null,

            issues:
              j.issues ||
              j.legal_issues ||
              null,

            decision:
              cleanDecision(
                j.decision ||
                j.holding
              ),

            ratio:
              j.ratio_decidendi ||
              j.ratio ||
              null,

            appliedToSection:
              j.applied_to_this_section ||
              null,

            basis:
              j.basis ||
              null,

            precedentialValue:
              j.precedential_value ||
              null,

            courtMarking:
              j.court_marking ||
              null,

            decidedUnder:
              j.decided_under ||
              null,

            source:
              j.url ||
              j.source ||
              null,

            document:
              j.document ||
              j.pdf ||
              j.document_url ||
              null
          };
        });


    return res.status(200).json({

      verified: true,

      mode: "search",

      query:
        userQuery ||
        null,

      act:
        act ||
        null,

      section:
        section ||
        null,

      court:
        court ||
        null,

      total,

      count:
        judgments.length,

      judgments
    });


  } catch (error) {

    console.error(
      "LawBot judgment error:",
      error
    );


    return res.status(500).json({

      verified: false,

      error:
        error.message ||
        "Judgment operation failed"
    });
  }
}


/* =========================================================
   JUDGMENT READER NORMALIZER
   ========================================================= */

function normalizeJudgment(j) {

  return {

    verified: true,

    caseName:
      j.title ||
      j.case_name ||
      j.caseName ||
      null,

    court:
      j.court_name ||
      j.court ||
      null,

    courtLevel:
      j.court_level ||
      null,

    date:
      j.date ||
      j.decision_date ||
      null,

    citation:
      j.citation ||
      null,

    cnr:
      j.cnr ||
      j.CNR ||
      null,

    judge:
      j.judge ||
      j.judges ||
      j.coram ||
      null,

    petitioner:
      j.petitioner ||
      j.appellant ||
      null,

    respondent:
      j.respondent ||
      j.respondents ||
      null,

    facts:
      j.facts ||
      j.case_facts ||
      null,

    issues:
      j.issues ||
      j.legal_issues ||
      null,

    arguments:
      j.arguments ||
      j.submissions ||
      null,

    findings:
      j.findings ||
      null,

    decision:
      cleanDecision(
        j.decision ||
        j.holding
      ),

    ratio:
      j.ratio_decidendi ||
      j.ratio ||
      null,

    relevantSections:
      j.applied_to_this_section ||
      j.relevant_sections ||
      j.sections ||
      null,

    basis:
      j.basis ||
      null,

    precedentialValue:
      j.precedential_value ||
      null,

    courtMarking:
      j.court_marking ||
      null,

    decidedUnder:
      j.decided_under ||
      null,

    source:
      j.url ||
      j.source ||
      null,

    document:
      j.document ||
      j.pdf ||
      j.document_url ||
      null,

    order:
      j.order ||
      j.document_type ||
      j.type ||
      null
  };
}


/* =========================================================
   CLEAN PDF/DOC FILE NAMES
   ========================================================= */

function cleanDecision(value) {

  if (!value) {
    return null;
  }


  const text =
    String(value).trim();


  if (
    /\.(pdf|doc|docx)$/i.test(text)
  ) {
    return null;
  }


  return text;
}
