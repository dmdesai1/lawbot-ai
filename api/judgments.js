export default async function handler(req, res) {

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    let query = "";
    let act = "";
    let section = "";
    let court = "";

    if (req.method === "POST") {

      const body = req.body || {};

      query = body.query || "";
      act = body.act || "";
      section = body.section || "";
      court = body.court || "";

    } else {

      query = req.query?.query || "";
      act = req.query?.act || "";
      section = req.query?.section || "";
      court = req.query?.court || "";

    }


    /*
      ------------------------------------------------
      STEP 1
      If a natural-language query was supplied,
      search the legal database first.
      ------------------------------------------------
    */

    if (query && !act && !section) {

      const searchUrl =
        `https://indiacode.ecourtsindia.com/api/v1/search?q=${encodeURIComponent(query)}&limit=20`;

      const searchResponse =
        await fetch(searchUrl);


      const searchData =
        await searchResponse.json();


      if (!searchResponse.ok) {

        return res.status(searchResponse.status).json({
          error:
            searchData.error ||
            "Legal search failed"
        });

      }


      /*
        Find the most useful statutory provision
        returned by the legal database.
      */

      const results =
        Array.isArray(searchData.results)
          ? searchData.results
          : [];


      const sectionResult =
        results.find(function(result) {

          return result.kind === "section";

        });


      if (sectionResult) {

        /*
          Example ref:

          ni-act/section/138
        */

        const parts =
          String(sectionResult.ref || "")
            .split("/");


        if (
          parts.length >= 3 &&
          parts[1] === "section"
        ) {

          act = parts[0];
          section = parts[2];

        }

      }


      /*
        If the search found an Act but not a section,
        remember the Act.
      */

      if (!act) {

        const actResult =
          results.find(function(result) {

            return result.kind === "act";

          });


        if (actResult && actResult.ref) {

          act =
            String(actResult.ref)
              .split("/")[0];

        }

      }

    }


    /*
      ------------------------------------------------
      STEP 2
      If we now know Act + Section, retrieve the
      actual verified judgments.
      ------------------------------------------------
    */

    const params =
      new URLSearchParams();


    if (act) {
      params.set("act", act);
    }


    if (section) {
      params.set("section", section);
    }


    if (court) {
      params.set("court", court);
    }


    params.set("limit", "100");


    let url =
      `https://indiacode.ecourtsindia.com/api/v1/judgments?${params.toString()}`;


    const allJudgments = [];

    let total = 0;


    /*
      Follow pagination until the database has
      returned all available matching judgments.
    */

    while (url) {

      const response =
        await fetch(url);


      const data =
        await response.json();


      if (!response.ok) {

        return res.status(response.status).json({
          error:
            data.error ||
            "Judgment search failed"
        });

      }


      total =
        data.total || total;


      if (
        Array.isArray(data.judgments)
      ) {

        allJudgments.push(
          ...data.judgments
        );

      }


      url =
        data.next || null;

    }


    /*
      ------------------------------------------------
      STEP 3
      Return only information actually supplied by
      the connected legal database.
      ------------------------------------------------
    */

    const judgments =
      allJudgments.map(function(judgment) {

        return {

          verified: true,

          caseName:
            judgment.title,

          court:
            judgment.court_name,

          date:
            judgment.date,

          citation:
            judgment.citation,

          cnr:
            judgment.cnr,

          source:
            judgment.url,

          precedentialValue:
            judgment.precedential_value,

          ratio:
            judgment.ratio_decidendi,

          appliedToSection:
            judgment.applied_to_this_section,

          basis:
            judgment.basis

        };

      });


    /*
      ------------------------------------------------
      STEP 4
      Return search information as well.
      ------------------------------------------------
    */

    return res.status(200).json({

      verified: true,

      query: query || null,

      act: act || null,

      section: section || null,

      court: court || null,

      total: total,

      count: judgments.length,

      judgments: judgments

    });


  } catch (error) {

    console.error(error);


    return res.status(500).json({

      error:
        "Server error while searching judgments"

    });

  }

          }
