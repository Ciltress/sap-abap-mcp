# RAP and transactional consistency

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- RAP
- Transactional Consistency

---

## RAP

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_BEHV_AUX</code> </td>
<td>
A utility class for retrieving information about RAP handler implementations, such as the current context of RAP handler/saver methods, the handler kind, and the current <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abentransactional_phase_glosry.htm">RAP transactional phase</a> (e.g., <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenrap_int_phase_glosry.htm">RAP interaction phase</a>.
<br><br>

``` abap
"Getting the current context of RAP handler implementations; 
"storing the information (true/false) in a variable declared inline
cl_abap_behv_aux=>get_current_context( IMPORTING from_projection = FINAL(fr_proj) 
                                                 from_interface  = FINAL(fr_int) 
                                                 in_local_mode   = FINAL(loc_mode) 
                                                 draft_activate  = FINAL(dr_act) 
                                                 for_permissions = FINAL(for_perm) 
                                                 privileged      = FINAL(priv) ).


"Getting the root entity name and handler kind
"For the latter, you can check the fixed values of abp_behv_kind (e.g., 'R' stands for read)  
DATA ent TYPE abp_root_entity_name.
FINAL(handler_kind) = cl_abap_behv_aux=>get_current_handler_kind( IMPORTING root_entity = ent ).

"Getting information about the current transactional phase
FINAL(phase) = cl_abap_behv_aux=>get_current_phase( ). 
"e.g. INTERACTION or EARLY_SAVE
``` 

</td>
</tr>
<tr>
<td> <code>CL_ABAP_BEHAVIOR_HANDLER</code> </td>
<td>
Used for <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenabp_handler_class_glosry.htm">RAP handler classes</a> that inherit from class <code>CL_ABAP_BEHAVIOR_HANDLER</code>. 
<br><br>

``` abap
"Skeleton of a RAP handler class declaration part in a CCIMP include
CLASS lcl_handler DEFINITION INHERITING FROM cl_abap_behavior_handler. 
  PRIVATE SECTION. 
  ... "Here go RAP handler method declarations
ENDCLASS. 

...
``` 

</td>
</tr>

<tr>
<td> <code>CL_ABAP_BEHAVIOR_SAVER</code> </td>
<td>
Used as base class from which a <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenabp_saver_class_glosry.htm">RAP saver class</a> in an <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenbehavior_pool_glosry.htm">ABAP behavior pool (ABP)</a> inherits. The RAP saver class must be defined in the <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenccimp_glosry.htm">CCIMP include</a> of an ABP. 
<br><br>

``` abap
"Skeleton of a RAP saver class declaration part in a CCIMP include
CLASS lsc_bdef DEFINITION INHERITING FROM cl_abap_behavior_saver. 
  PROTECTED SECTION. 
     METHODS finalize REDEFINITION. 
     METHODS check_before_save REDEFINITION. 
     METHODS save REDEFINITION.      
     METHODS cleanup REDEFINITION. 
     METHODS cleanup_finalize REDEFINITION. 
ENDCLASS. 

...
``` 

</td>
</tr>
<tr>
<td> <code>CL_ABAP_BEHAVIOR_SAVER_FAILED</code> </td>
<td>
<ul>
<li>Same as <code>CL_ABAP_BEHAVIOR_SAVER</code>. It is used as base class from which a RAP saver class in an ABAP behavior pool (ABP) inherits. </li>
<li>Normally, the basic rule is that failures must not occur in the RAP late save phase, but must be detected in the <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenearly_rap_save_phase_glosry.htm">RAP early save phase</a> in order for the save to be successful. The base class <code>CL_ABAP_BEHAVIOR_SAVER_FAILED</code> can be used in exceptional cases where the basic rule cannot be met.</li>
<li>For more information, see the <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenabp_cl_abap_beh_saver_failed.htm">ABAP Keyword Documentation</a>.</li>
</ul>
<br>

``` abap
"Skeleton of a RAP saver class declaration part in a CCIMP include
CLASS lsc_bdef DEFINITION INHERITING FROM cl_abap_behavior_saver_failed. 
  PROTECTED SECTION.    
     ...
     METHODS save REDEFINITION.
     "Unlike in CL_ABAP_BEHAVIOR_SAVER, the RAP response parameters failed and reported are included.
     ...
ENDCLASS. 

...
``` 

</td>
</tr>
<tr>
<td> <code>CL_ABAP_BEHAVIOR_EVENT_HANDLER</code> </td>
<td>
It is used as base class from which a RAP event handler class in its CCIMP include inherits. Its purpose is to locally consume RAP business events.
More information: <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abenrap_events.htm">ABAP for RAP Business Events</a>.
<br><br>

``` abap
"Skeleton of a RAP event handler class declaration part in a CCIMP include
"The assumption is that there are the events 'created', 'updated', and 
"'deleted' specified in the BDEF.
CLASS lhe_event DEFINITION INHERITING FROM cl_abap_behavior_event_handler.

  PRIVATE SECTION.

    METHODS on_updated FOR ENTITY EVENT
       updated FOR some_bdef~updated.

    METHODS on_deleted FOR ENTITY EVENT
       deleted FOR some_bdef~deleted.

    METHODS on_created FOR ENTITY EVENT
       created FOR some_bdef~created.

ENDCLASS. 

...
```

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Transactional Consistency

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_TX</code> </td>
<td>
<ul>
<li>Explicitly setting <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abentr_phase_glosry.htm">transactional phases</a> (the modify and save transactional phase) to enable transactional consistency checks with the <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abencontrolled_sap_luw_glosry.htm">controlled SAP LUW</a> (which is an extension of the SAP LUW concept)</li>
<li>The controlled SAP LUW is automatically and implicitly supported by newer ABAP concepts such as RAP, i.e. the transactional phases are implicitly active when RAP handler methods are called.</li>
<li>Operations that are not allowed in a transactional phase are detected, resulting in a runtime error in certain contexts (or the violations are logged). 
For example, database modifications are only allowed in the save transactional phase because the data being processed in the modify phase may be inconsistent. Therefore, a database modification in the modify phase can disrupt the SAP LUW.</li>
<li>For more information, refer to the chapter <a href="https://help.sap.com/docs/abap-cloud/abap-concepts/controlled-sap-luw">Controlled SAP LUW</a>.</li>
<li>See the restrictions in the ABAP Keyword Documentation: <a href="https://help.sap.com/doc/abapdocu_cp_index_htm/CLOUD/en-US/index.htm?file=abapinvalid_stmts_in_tx.htm">ABAP for Cloud Development</a> / <a href="https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/index.htm?file=abapinvalid_stmts_in_tx.htm">Standard ABAP</a>.</li>
</ul>
<br>

``` abap
...

"Activating the modify transactional phase
cl_abap_tx=>modify( ).

"The following database modification statement is not allowed in the
"modify transactional phase. In certain contexts, e.g. in ABAP Cloud,
"the runtime error BEHAVIOR_ILLEGAL_STMT_IN_CALL occurs.
MODIFY zdemo_abap_carr FROM TABLE @( VALUE #(
    ( carrid = 'XY'
      carrname = 'XY Airlines'
      currcode = 'EUR'
      url =  'some_url' ) ) ).

...

"Activating the save transactional phase
cl_abap_tx=>save( ).

"In this phase, database modifications are allowed.
MODIFY zdemo_abap_carr FROM TABLE @( VALUE #(
    ( carrid = 'XY'
      carrname = 'XY Airlines'
      currcode = 'EUR'
      url =  'some_url' ) ) ).
...
``` 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
