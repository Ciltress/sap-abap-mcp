# HTTP calls, email and generative AI

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Calling Services
- Sending Emails
- Generative AI

---

## Calling Services

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_WEB_HTTP_CLIENT_MANAGER</code><br><code>CL_HTTP_DESTINATION_PROVIDER</code> </td>
<td>
<ul>
<li>For creating a client object using an HTTP destination. The HTTP destination is provided based on an HTTP destination object.
The latter can be created, among others, based on a communication arrangement or a plain URL. </li>
<li>For more information, refer to the class documentation and the topic <a href="https://help.sap.com/docs/btp/sap-business-technology-platform/integration-and-connectivity">Integration and Connectivity</a>.</li>
</ul>

To check out examples in demo classes, expand the collapsible sections below.


<details>
  <summary>🟢 1. Read example: Retrieving ABAP cheat sheet markdown content using a GitHub API and sending a ZIP file with the content via email</summary>
  <!-- -->



> [!WARNING] 
> - The following self-contained and oversimplified example is not a representative best practice example, nor does it cover a meaningful use case. It only explores method calls and is intended to give a rough idea of the functionality.</li>
> - The example uses the <code>create_by_url</code> method, which is only suitable for public services or testing purposes. No authentication is required for the APIs used.
> - Note the <a href="README.md#%EF%B8%8F-disclaimer">Disclaimer</a>.</li>
> - For more information, more meaningful examples, and tutorials that deal with the classes and methods, see the following links:
>   - <a href="https://developers.sap.com/tutorials/abap-environment-external-api.html">Call an External API and Parse the Response in SAP BTP ABAP Environment</a>
>   - <a href="https://community.sap.com/t5/technology-blogs-by-sap/how-to-call-a-remote-odata-service-from-the-trial-version-of-sap-cloud/ba-p/13411535">How to call a remote OData service from the trial version of SAP Cloud Platform ABAP environment</a>
> - The example is generally about calling external APIs and parsing the HTTP responses. It retrieves the Markdown files of the ABAP cheat sheet documents contained in the ABAP cheat sheet GitHub repository.  
> - Before using the GitHub APIs, make sure that you have consulted the following documentation: <a href="https://docs.github.com/en">GitHub Docs</a>, <a href="https://docs.github.com/en/enterprise-cloud@latest/rest/markdown/markdown?apiVersion=2022-11-28#render-a-markdown-document">Render a Markdown document</a>, <a href="https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28">Rate limits for the REST API</a>
> - For the example to work and send emails, make sure that the configurations from [here](https://help.sap.com/docs/btp/sap-business-technology-platform/emailing) have been performed.
> - To run the example class, copy and paste the code into a class named `zcl_demo_abap`. Run the class using F9. The email sending status will be displayed, and you can expect an email to be sent.   




``` abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
    "Markdown URLs
    CONSTANTS url_cs TYPE string VALUE `https://api.github.com/repos/SAP-samples/abap-cheat-sheets/git/trees/main`.
    CONSTANTS url_gh TYPE string VALUE `https://raw.githubusercontent.com/SAP-samples/abap-cheat-sheets/main/`.
    "Here go email addresses
    CONSTANTS sender_addr TYPE cl_bcs_mail_message=>ty_address VALUE '...@...'.
    CONSTANTS recipient_addr TYPE cl_bcs_mail_message=>ty_address VALUE '...@...'.

    TYPES: BEGIN OF s,
             file_name TYPE string,
             markdown  TYPE string,
             error     TYPE abap_boolean,
           END OF s.
    DATA tab TYPE TABLE OF s WITH EMPTY KEY.
    DATA url TYPE string.
ENDCLASS.



CLASS zcl_demo_abap IMPLEMENTATION.


  METHOD if_oo_adt_classrun~main.

    "----------- Retrieving all Markdown file names in the ABAP cheat sheet GitHub repository -----------

    TRY.
        "Creating a client object using a destination
        "In the example, the HTTP destination is created using a plain URL.
        "Here, a GitHub API is used to retrieve file names of the ABAP cheat sheet repository.
        DATA(http_client) = cl_web_http_client_manager=>create_by_http_destination( i_destination = cl_http_destination_provider=>create_by_url( i_url = url_cs ) ).
        "Sending an HTTP GET request and returning the response
        "In the example, the HTTP body is retrieved as string data.
        DATA(response) = http_client->execute( if_web_http_client=>get )->get_text(  ).
        IF response CS `API rate limit exceeded`.
          out->write( `API rate limit exceeded` ).
          RETURN.
        ENDIF.

      CATCH cx_root INTO DATA(err).
        out->write( err->get_text( ) ).
        RETURN.
    ENDTRY.


    "----------- Retrieving Markdown content from ABAP cheat sheet GitHub repository -----------

    IF err IS INITIAL.
      "Markdown file names are contained in the returned string in a specific
      "pattern. In the following code, the markdown file names are extracted
      "using a regular expression (pattern: "path":"04_ABAP_Object_Orientation.md")
      "After '"path":"' (not including this part, indivated by \K), two
      "digits must follow. Then, the further file name is captured with a
      "non-greedy capturing up to '.md'.
      FIND ALL OCCURRENCES OF PCRE `("path":")\K\d\d.*?\.md` IN response
        RESULTS DATA(results)
        IGNORING CASE.

      "The 'results' internal table contains all findings and includes their
      "offset and length information.
      "Using a loop, the actual file names are extracted from the 'response'
      "string and added to an internal table that is to receive more information
      "in the code below.
      LOOP AT results REFERENCE INTO DATA(md).
        tab = VALUE #( BASE tab ( file_name = substring( val = response off = md->offset len = md->length ) ) ).
      ENDLOOP.
      SORT tab BY file_name ASCENDING.

      "In the following loop, the Markdown content is retrieved using an HTTP GET request, also
      "by creating a client object and using a destination (another plain URL). The URL is constructed
      "using the constant value plus the markdown file that was retrieved before.
      LOOP AT tab REFERENCE INTO DATA(cs).
        url = url_gh && cs->file_name.
        TRY.
            http_client = cl_web_http_client_manager=>create_by_http_destination( i_destination = cl_http_destination_provider=>create_by_url( i_url = url ) ).
            DATA(raw_md) = http_client->execute( if_web_http_client=>get )->get_text(  ).
            cs->markdown = raw_md.
          CATCH cx_root.
            cs->error = abap_true.
        ENDTRY.
      ENDLOOP.

      "----------- Creating a zip file containing all ABAP cheat sheet Markdown documents -----------

      DATA(zip) = NEW cl_abap_zip( ).

      "Iteratively adding the ABAP cheat sheet Markdown documents to the zip file
      LOOP AT tab REFERENCE INTO cs WHERE error = abap_false.        
        TRY.
            DATA(conv_xstring) = cl_abap_conv_codepage=>create_out( codepage = `UTF-8` )->convert( cs->markdown ).
          CATCH cx_sy_conversion_codepage.
        ENDTRY.

        "Adding the xstring content as file content to zip
        zip->add( name = cs->file_name
                  content = conv_xstring ).

      ENDLOOP.

      "Saving the zip file
      DATA(zipped_file) = zip->save( ).

      "----------- Creating a ZIP file containing all ABAP cheat sheet Markdown documents -----------

      "Sending email
      TRY.
          "Creating a new mail instance
          DATA(mail) = cl_bcs_mail_message=>create_instance( ).
          "Settings
          mail->set_sender( sender_addr ).
          mail->add_recipient( recipient_addr ).
          mail->set_subject( 'Test Mail' ).
          "Main document
          mail->set_main( cl_bcs_mail_textpart=>create_instance(
            iv_content      = '<h3>Test Mail</h3><p>Please find ABAP cheat sheet markdown files attached.<br>Cheers</p>'
            iv_content_type = 'text/html' ) ).
          "Adding an attachment
          mail->add_attachment( cl_bcs_mail_binarypart=>create_instance(
                iv_content      =  zipped_file
                iv_content_type = 'application/x-zip-compressed'
                iv_filename     = 'abap_cheat_sheets.zip' ) ).

          "Sending mail synchronously, displaying the status for each recipient
          mail->send( IMPORTING et_status = DATA(status_table) ).
          out->write( status_table ).
        CATCH cx_bcs_mail INTO DATA(error_mail).
          out->write( |Mail sending error: { error_mail->get_text( ) }| ).
      ENDTRY.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
``` 
</details>  

<br>

<details>
  <summary>🟢 2. Post example: Demonstrating a post request by converting Markdown to HTML using the GitHub API</summary>
  <!-- -->



> [!WARNING] 
> - As stated for the previous example, also note for this example: Before using the GitHub APIs, make sure that you have consulted the following documentation: <a href="https://docs.github.com/en">GitHub Docs</a>, <a href="https://docs.github.com/en/enterprise-cloud@latest/rest/markdown/markdown?apiVersion=2022-11-28#render-a-markdown-document">Render a Markdown document</a>, <a href="https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28">Rate limits for the REST API</a>
> - To run the example class, copy and paste the code into a class named `zcl_demo_abap`. Run the class using F9. It is set up to display HTML content in the console. Using the GitHub API, sample Markdown content is sent and converted to HTML.



``` abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
    CONSTANTS url_api TYPE string VALUE `https://api.github.com/markdown`.
ENDCLASS.



CLASS zcl_demo_abap IMPLEMENTATION.


  METHOD if_oo_adt_classrun~main.

    DATA(markdown_content) =
    `# Lorem ipsum dolor sit amet \n`    &&
    `Consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. \n` &&
    `Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. \n` &&
    `- Duis aute irure \n` &&
    `- Dolor in reprehenderit in voluptate \n` &&
    `1. Velit esse cillum dolore eu fugiat nulla pariatur \n` &&
    `2. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. \n` &&
    `3. [ABAP cheat sheets](https://github.com/SAP-samples/abap-cheat-sheets)`.

    TRY.
        "Creation of a client object using a destination
        "This example deals with a POST request.
        DATA(http_client) = cl_web_http_client_manager=>create_by_http_destination( i_destination = cl_http_destination_provider=>create_by_url( i_url = url_api ) ).
        DATA(request) = http_client->get_http_request( ).
        request->set_text( `{"text":"` && markdown_content && `"}` ).
        request->set_header_fields( VALUE #( ( name = 'Accept' value = 'application/vnd.github+json' ) ) ).
        DATA(post) = http_client->execute( if_web_http_client=>post ).
        DATA(status) = post->get_status( ).
        IF status-code <> 200.
          out->write( |Post request error: { status-code } / { status-reason }| ).
        ELSE.
          DATA(html) = post->get_text( ).
          out->write( html ).
        ENDIF.
      CATCH cx_root INTO DATA(error).
        out->write( error->get_text( ) ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
``` 
</details>  



</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Sending Emails

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_BCS_MAIL_MESSAGE</code> </td>
<td>

<ul>
<li>For sending emails, a configuration is required. Find more information <a href="https://help.sap.com/docs/btp/sap-business-technology-platform/emailing">here</a>.</li>
<li>Note that you can also send emails asynchronously using the method <code>send_async</code>.</li>
</ul>
<br>

``` abap
TRY.
    DATA(mail) = cl_bcs_mail_message=>create_instance( ).
    mail->set_sender( '...@...' ).
    mail->add_recipient( '...@...' ).
    mail->set_subject( 'Test Mail' ).
    mail->set_main( cl_bcs_mail_textpart=>create_instance(
      iv_content      = '<h1>Hello</h1><p>This is a test mail.</p>'
      iv_content_type = 'text/html' ) ).
    mail->send( IMPORTING et_status = DATA(status_table) ).
    "You can check the status of the email sending in the returned table. 
    "'status' components: E (error), S (sent), W (waiting)
  CATCH cx_bcs_mail INTO DATA(error_mail).
    ...
ENDTRY.
``` 

The following snippet includes some file attachments:

```abap
TRY.
    "Creating a new mail instance
    DATA(mail) = cl_bcs_mail_message=>create_instance( ).
    "Settings
    mail->set_sender( '...@...' ).
    mail->add_recipient( '...@...' ).
    mail->set_subject( 'Test Mail' ).    
    mail->set_main( cl_bcs_mail_textpart=>create_instance(
      iv_content      = `<h3>Test Mail</h3><p>Please find some files attached.<br>Cheers</p>`
      iv_content_type = `text/html` ) ).

    "Adding attachments
    "Adding a text file
    mail->add_attachment( cl_bcs_mail_textpart=>create_text_plain(
                            iv_content  = `This is some sample text.`
                            iv_filename = `txt_file.txt` ) ).

    "Adding an XML file
    mail->add_attachment( cl_bcs_mail_textpart=>create_instance(
                            iv_content = `<?xml version="1.0"?>` &&
                                         `<node attr_a="123">` &&
                                         ` <subnode1>` &&
                                         ` <status>A</status>` &&
                                         ` <date format="mm-dd-yyyy">01-01-2024</date>` &&
                                         ` </subnode1>` &&
                                         ` <subnode2>`  &&
                                         ` <text attr_b="1" attr_c="a">abc</text>` &&
                                         ` <text attr_b="2" attr_c="b">def</text>` &&
                                         ` <text attr_b="3" attr_c="c">ghi</text>` &&
                                         ` </subnode2>` &&
                                         `</node>`
                            iv_content_type = `text/xml`
                            iv_filename     = `xml_file.xml` ) ).

    "Adding a zip file
    DATA(zip) = NEW cl_abap_zip( ).
    DATA(txt_content) = `This is some sample text for a file that is zipped.`.
    TRY.
        DATA(conv_xstring) = cl_abap_conv_codepage=>create_out( codepage = `UTF-8` )->convert( txt_content ).
      CATCH cx_sy_conversion_codepage.
    ENDTRY.
    zip->add( EXPORTING name = |test_txt_file.txt|
                        content = conv_xstring ).
    DATA(zipped_file) = zip->save( ).

    mail->add_attachment( cl_bcs_mail_binarypart=>create_instance(
          iv_content      =  zipped_file
          iv_content_type = 'application/x-zip-compressed'
          iv_filename     = 'zip_file.zip' ) ).

    mail->send( ).
  CATCH cx_bcs_mail INTO DATA(error_mail).
    DATA(error_mail_msg) = error_mail->get_text( ).
ENDTRY.
```

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Generative AI

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_AIC_ISLM_COMPL_API_FACTORY</code><br><code>CL_AIC_ISLM_PROMPT_TPL_FACTORY</code> </td>
<td>

- ABAP classes available in the *ABAP AI SDK powered by Intelligent Scenario Lifecycle Management* for interacting with large language models (LLMs) in custom implementations
- Find more information in the [documentation](https://help.sap.com/docs/abap-ai/generative-ai-in-abap-cloud/generative-ai-in-abap-cloud?locale=en-US) and the [Generative AI](30_Generative_AI.md) cheat sheet.
- The following method calls create an instance of the ISLM completion API, use a prompt as string, and retrieve the LLM answer.

 <br>

```abap
TRY.
    FINAL(ai_api) = cl_aic_islm_compl_api_factory=>get( )->create_instance( 'ZDEMO_ABAP_INT_SCEN' ).
    FINAL(result) = ai_api->execute_for_string( `Tell me a joke.` ).
    FINAL(completion) = result->get_completion( ).
  CATCH cx_aic_api_factory cx_aic_completion_api INTO FINAL(error).
    FINAL(error_text) = error->get_text( ).
ENDTRY.
```
 
</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
